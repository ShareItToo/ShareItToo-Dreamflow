import { parseRentalDates } from './booking_domain.js';
import { BookingWorkflowError, quoteBooking } from './booking_workflow.js';
import { postgresDateText } from './postgres_date.js';

const MAX_PROJECTS = 20;
const MAX_ITEMS = 100;
const MAX_ANSWERS_BYTES = 16_000;

export class RentalCartError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code = 'invalid_rental_cart_payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RentalCartError(400, code);
  }
  return { ...value };
}

function text(value, maximum = 120) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function clientIdentifier(value, code) {
  const candidate = text(value, 120);
  if (!/^[A-Za-z0-9_.:-]{8,120}$/.test(candidate)) {
    throw new RentalCartError(400, code);
  }
  return candidate;
}

function sortOrder(value) {
  const candidate = Number(value ?? 0);
  if (!Number.isInteger(candidate) || candidate < 0 || candidate > 10_000) {
    throw new RentalCartError(400, 'invalid_rental_cart_sort_order');
  }
  return candidate;
}

function projectAnswers(value) {
  if (value == null) return {};
  const candidate = object(value, 'invalid_rental_cart_project_answers');
  if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MAX_ANSWERS_BYTES) {
    throw new RentalCartError(400, 'rental_cart_project_answers_too_large');
  }
  return candidate;
}

function dateValue(value) {
  return postgresDateText(value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function projectShape(row) {
  return Object.freeze({
    id: row.client_project_id,
    title: row.title,
    answers: row.answers ?? {},
    sortOrder: Number(row.sort_order),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
}

function itemShape(row) {
  const listingPayload = row.listing_payload && typeof row.listing_payload === 'object'
    && !Array.isArray(row.listing_payload)
    ? row.listing_payload
    : {};
  return Object.freeze({
    id: row.client_item_id,
    listingId: row.listing_id,
    projectId: row.client_project_id ?? null,
    startDate: dateValue(row.rental_start_date),
    endDate: dateValue(row.rental_end_date),
    sortOrder: Number(row.sort_order),
    quoteStatus: row.quote_status,
    quoteErrorCode: row.quote_error_code ?? null,
    quoteRecheckedAt: timestamp(row.quote_rechecked_at),
    quote: row.quote_payload ?? null,
    listing: Object.freeze({
      id: row.listing_id,
      title: text(listingPayload.title, 200) || 'Mietartikel',
      photos: Array.isArray(listingPayload.photos) ? listingPayload.photos : [],
      city: text(row.listing_city ?? listingPayload.city, 120) || null,
      active: row.listing_is_active === true
        && row.listing_status === 'active'
        && row.listing_moderation_status === 'active',
    }),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
}

async function cartRow(client, actorId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT id, schema_version, revision, created_at, updated_at
       FROM rental_carts
      WHERE user_id = $1
      ${lock ? 'FOR UPDATE' : ''}`,
    [actorId],
  );
  return result.rows[0] ?? null;
}

async function ensureCart(client, actorId) {
  await client.query(
    `INSERT INTO rental_carts (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [actorId],
  );
  return cartRow(client, actorId, { lock: true });
}

async function touchCart(client, cartId) {
  await client.query(
    `UPDATE rental_carts
        SET revision = revision + 1, updated_at = now()
      WHERE id = $1`,
    [cartId],
  );
}

async function shapeCart(client, actorId) {
  const cart = await cartRow(client, actorId);
  if (!cart) {
    return Object.freeze({
      schemaVersion: 1,
      revision: 0,
      reservationCreated: false,
      projects: [],
      items: [],
      createdAt: null,
      updatedAt: null,
    });
  }
  const projects = await client.query(
    `SELECT client_project_id, title, answers, sort_order, created_at, updated_at
       FROM rental_cart_projects
      WHERE cart_id = $1
      ORDER BY sort_order, created_at, id`,
    [cart.id],
  );
  const items = await client.query(
    `SELECT item.client_item_id, item.listing_id,
            project.client_project_id,
            item.rental_start_date, item.rental_end_date, item.sort_order,
            item.quote_status, item.quote_error_code, item.quote_rechecked_at,
            item.quote_payload, item.created_at, item.updated_at,
            listing.payload AS listing_payload, listing.city AS listing_city,
            listing.is_active AS listing_is_active, listing.status AS listing_status,
            listing.moderation_status AS listing_moderation_status
       FROM rental_cart_items AS item
       JOIN listings AS listing ON listing.id = item.listing_id
       LEFT JOIN rental_cart_projects AS project ON project.id = item.project_id
      WHERE item.cart_id = $1
      ORDER BY item.sort_order, item.created_at, item.id`,
    [cart.id],
  );
  return Object.freeze({
    schemaVersion: Number(cart.schema_version),
    revision: Number(cart.revision),
    reservationCreated: false,
    projects: projects.rows.map(projectShape),
    items: items.rows.map(itemShape),
    createdAt: timestamp(cart.created_at),
    updatedAt: timestamp(cart.updated_at),
  });
}

async function projectIdForCart(client, cartId, clientProjectId) {
  if (!clientProjectId) return null;
  const result = await client.query(
    `SELECT id FROM rental_cart_projects
      WHERE cart_id = $1 AND client_project_id = $2`,
    [cartId, clientProjectId],
  );
  if (!result.rowCount) throw new RentalCartError(404, 'rental_cart_project_not_found');
  return result.rows[0].id;
}

export async function getRentalCart(client, actorId) {
  return shapeCart(client, actorId);
}

export async function putRentalCartProject(client, {
  actorId,
  clientProjectId,
  raw,
}) {
  const projectId = clientIdentifier(clientProjectId, 'invalid_rental_cart_project_id');
  const candidate = object(raw);
  const title = text(candidate.title, 120);
  if (!title) throw new RentalCartError(400, 'rental_cart_project_title_required');
  const answers = projectAnswers(candidate.answers);
  const order = sortOrder(candidate.sortOrder);
  const cart = await ensureCart(client, actorId);
  const existing = await client.query(
    `SELECT id FROM rental_cart_projects
      WHERE cart_id = $1 AND client_project_id = $2`,
    [cart.id, projectId],
  );
  if (!existing.rowCount) {
    const count = await client.query(
      'SELECT count(*)::int AS count FROM rental_cart_projects WHERE cart_id = $1',
      [cart.id],
    );
    if (count.rows[0].count >= MAX_PROJECTS) {
      throw new RentalCartError(409, 'rental_cart_project_limit_reached');
    }
  }
  await client.query(
    `INSERT INTO rental_cart_projects (
       cart_id, client_project_id, title, answers, sort_order
     ) VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (cart_id, client_project_id) DO UPDATE
       SET title = EXCLUDED.title,
           answers = EXCLUDED.answers,
           sort_order = EXCLUDED.sort_order,
           updated_at = now()`,
    [cart.id, projectId, title, JSON.stringify(answers), order],
  );
  await touchCart(client, cart.id);
  return shapeCart(client, actorId);
}

export async function deleteRentalCartProject(client, {
  actorId,
  clientProjectId,
}) {
  const projectId = clientIdentifier(clientProjectId, 'invalid_rental_cart_project_id');
  const cart = await cartRow(client, actorId, { lock: true });
  if (!cart) throw new RentalCartError(404, 'rental_cart_project_not_found');
  const removed = await client.query(
    `DELETE FROM rental_cart_projects
      WHERE cart_id = $1 AND client_project_id = $2
      RETURNING id`,
    [cart.id, projectId],
  );
  if (!removed.rowCount) throw new RentalCartError(404, 'rental_cart_project_not_found');
  await touchCart(client, cart.id);
  return shapeCart(client, actorId);
}

export async function putRentalCartItem(client, {
  actorId,
  clientItemId,
  raw,
  privatePilot = false,
  privatePilotAllowedRegions = [],
  quoteCandidate = quoteBooking,
}) {
  const itemId = clientIdentifier(clientItemId, 'invalid_rental_cart_item_id');
  const candidate = object(raw);
  const listingId = text(candidate.listingId ?? candidate.itemId, 120);
  if (!listingId) throw new RentalCartError(400, 'rental_cart_listing_required');
  const dates = parseRentalDates(
    text(candidate.startDate, 10),
    text(candidate.endDate, 10),
    { maxDays: 365 },
  );
  if (!dates) throw new RentalCartError(400, 'invalid_rental_cart_dates');
  const clientProjectId = candidate.projectId == null || candidate.projectId === ''
    ? null
    : clientIdentifier(candidate.projectId, 'invalid_rental_cart_project_id');
  const order = sortOrder(candidate.sortOrder);

  const listing = await client.query(
    'SELECT owner_id FROM listings WHERE id = $1',
    [listingId],
  );
  if (!listing.rowCount) throw new RentalCartError(404, 'listing_not_found');
  if (listing.rows[0].owner_id === actorId) {
    throw new RentalCartError(409, 'cannot_rent_own_listing');
  }
  let quote = null;
  let quoteErrorCode = null;
  try {
    quote = await quoteCandidate(client, {
      actorId,
      raw: { listingId, startDate: dates.startDate, endDate: dates.endDate },
      privatePilot,
      privatePilotAllowedRegions,
      persist: false,
    });
  } catch (error) {
    if (!(error instanceof BookingWorkflowError) || error.status >= 500) throw error;
    quoteErrorCode = /^[a-z0-9_.:-]{1,120}$/.test(error.code)
      ? error.code
      : 'rental_cart_quote_unavailable';
  }
  const cart = await ensureCart(client, actorId);
  const projectId = await projectIdForCart(client, cart.id, clientProjectId);
  const existing = await client.query(
    `SELECT id FROM rental_cart_items
      WHERE cart_id = $1 AND client_item_id = $2`,
    [cart.id, itemId],
  );
  if (!existing.rowCount) {
    const count = await client.query(
      'SELECT count(*)::int AS count FROM rental_cart_items WHERE cart_id = $1',
      [cart.id],
    );
    if (count.rows[0].count >= MAX_ITEMS) {
      throw new RentalCartError(409, 'rental_cart_item_limit_reached');
    }
  }
  await client.query(
    `INSERT INTO rental_cart_items (
       cart_id, client_item_id, listing_id, project_id,
       rental_start_date, rental_end_date,
       quote_id, quote_hash, quote_payload, quote_status,
       quote_error_code, quote_rechecked_at, sort_order
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9::jsonb, $10, $11, now(), $12
     )
     ON CONFLICT (cart_id, client_item_id) DO UPDATE
       SET listing_id = EXCLUDED.listing_id,
           project_id = EXCLUDED.project_id,
           rental_start_date = EXCLUDED.rental_start_date,
           rental_end_date = EXCLUDED.rental_end_date,
           quote_id = EXCLUDED.quote_id,
           quote_hash = EXCLUDED.quote_hash,
           quote_payload = EXCLUDED.quote_payload,
           quote_status = EXCLUDED.quote_status,
           quote_error_code = EXCLUDED.quote_error_code,
           quote_rechecked_at = now(),
           sort_order = EXCLUDED.sort_order,
           updated_at = now()`,
    [
      cart.id, itemId, listingId, projectId,
      dates.startDate, dates.endDate,
      quote?.quoteId ?? null,
      quote?.quoteHash ?? null,
      quote == null ? null : JSON.stringify(quote),
      quote == null ? 'unavailable' : 'current',
      quoteErrorCode,
      order,
    ],
  );
  await touchCart(client, cart.id);
  return shapeCart(client, actorId);
}

export async function deleteRentalCartItem(client, {
  actorId,
  clientItemId,
}) {
  const itemId = clientIdentifier(clientItemId, 'invalid_rental_cart_item_id');
  const cart = await cartRow(client, actorId, { lock: true });
  if (!cart) throw new RentalCartError(404, 'rental_cart_item_not_found');
  const removed = await client.query(
    `DELETE FROM rental_cart_items
      WHERE cart_id = $1 AND client_item_id = $2
      RETURNING id`,
    [cart.id, itemId],
  );
  if (!removed.rowCount) throw new RentalCartError(404, 'rental_cart_item_not_found');
  await touchCart(client, cart.id);
  return shapeCart(client, actorId);
}

export async function recheckRentalCart(client, {
  actorId,
  privatePilot = false,
  privatePilotAllowedRegions = [],
}) {
  const cart = await cartRow(client, actorId, { lock: true });
  if (!cart) return shapeCart(client, actorId);
  const items = await client.query(
    `SELECT id, listing_id, rental_start_date, rental_end_date, quote_hash
       FROM rental_cart_items
      WHERE cart_id = $1
      ORDER BY sort_order, created_at, id
      FOR UPDATE`,
    [cart.id],
  );
  for (const item of items.rows) {
    try {
      const quote = await quoteBooking(client, {
        actorId,
        raw: {
          listingId: item.listing_id,
          startDate: dateValue(item.rental_start_date),
          endDate: dateValue(item.rental_end_date),
        },
        privatePilot,
        privatePilotAllowedRegions,
        persist: false,
      });
      const quoteStatus = item.quote_hash && item.quote_hash !== quote.quoteHash
        ? 'changed'
        : 'current';
      await client.query(
        `UPDATE rental_cart_items
            SET quote_id = $2, quote_hash = $3, quote_payload = $4::jsonb,
                quote_status = $5, quote_error_code = NULL,
                quote_rechecked_at = now(), updated_at = now()
          WHERE id = $1`,
        [item.id, quote.quoteId, quote.quoteHash, JSON.stringify(quote), quoteStatus],
      );
    } catch (error) {
      if (!(error instanceof BookingWorkflowError) || error.status >= 500) throw error;
      const errorCode = /^[a-z0-9_.:-]{1,120}$/.test(error.code)
        ? error.code
        : 'rental_cart_quote_unavailable';
      await client.query(
        `UPDATE rental_cart_items
            SET quote_status = 'unavailable', quote_error_code = $2,
                quote_rechecked_at = now(), updated_at = now()
          WHERE id = $1`,
        [item.id, errorCode],
      );
    }
  }
  if (items.rowCount) await touchCart(client, cart.id);
  return shapeCart(client, actorId);
}
