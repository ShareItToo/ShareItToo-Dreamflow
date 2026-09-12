# ShareItToo - Architecture Documentation (Historical Snapshot)

> **Historical only — do not use as current implementation authority.** This
> document describes an early prototype and is preserved for traceability. Its
> statements about vehicles, deposits, sample data, local-only persistence,
> future Firebase migration, broad internationalization and incomplete booking
> flows are stale or conflict with the current fail-closed launch boundaries.
> Use `AGENTS.md`, `docs/current_state.md`,
> `docs/current_work_package.md`, the versioned documents under
> `docs/architecture/`, and the validated manifests under `store/` for current
> work. The remainder below is intentionally retained as historical text.

## App Overview
ShareItToo is a peer-to-peer rental marketplace for ANY item, following an Airbnb-like design structure. Users can rent anything from tools to electronics, with a complete booking flow and messaging system.

## Theme & Design System

### Colors
- **Primary**: #0EA5E9 (Sky Blue)
- **Secondary**: #111827 (Dark Gray)
- **Light Surface**: #F8FAFC (Light Gray)
- **Dark Background**: #0F172A (Dark Blue)
- **Success**: #22C55E (Green)
- **Danger**: #F43F5E (Red)
- **Highlight**: #FB923C (Orange)
- **Info**: #3B82F6 (Blue)

### Design Principles
- Rounded corners XL (16–20px)
- Soft shadows on cards/buttons
- 8/12/16px spacing grid
- 44px minimum touch targets
- Inter font family
- Material3 design system

## Navigation Structure

### Bottom Navigation (5 Fixed Tabs)
1. **Erkunden** - Main discovery and search
2. **Wunschlisten** - Saved items and collections
3. **Buchungen** - User's rental bookings
4. **Nachrichten** - Messaging and communication
5. **Profil** - User profile and settings

## Data Models

### Core Models
- **User**: Profile, verification, ratings
- **Item**: Rental items with photos, pricing, location
- **Category**: Hierarchical category system
- **Booking**: Rental transactions and status
- **Thread/Message**: Communication system
- **Review**: Rating and feedback system

### Storage Strategy
- **Local Storage**: SharedPreferences for simple data
- **Firebase Ready**: Models designed for Firestore migration

## Key Features Implementation

### 1. Explore Screen
- Large search bar with location/date/category filters
- Horizontal scrollable category chips (multi-select)
- Filters bottom sheet (price, distance, condition, verification)
- 2-column responsive grid layout
- Item cards with photos, pricing, ratings, verification badges

### 2. Item Management
- Complete category taxonomy (38 main categories)
- Photo galleries and detailed descriptions
- Availability calendar system
- Pricing with deposits and daily rates
- Location-based search with geohashing

### 3. Booking System
- Request/Accept/Decline workflow
- Status tracking (requested → accepted → paid → ongoing → completed)
- Timeline with "Übergabe" and "Rückgabe" terms
- Payment integration ready (Stripe Connect placeholders)

### 4. Communication
- Thread-based messaging
- Filter by type (All, Bookings, Support)
- Translation toggle (Google Cloud Translation ready)
- Read receipts and typing indicators

### 5. User Profile
- Stats display (bookings, reviews)
- Host onboarding CTA
- Settings and account management
- Verification system

## Internationalization

### Languages Supported
- **Primary**: German (de-DE)
- **Secondary**: English (en-US)
- **Prepared for**: 25+ additional languages

### Implementation
- All strings use i18n keys
- Currency formatting by locale
- Distance units (km/mi) by region
- Timezone handling

## Technical Architecture

### File Structure
```
lib/
├── main.dart                 # App entry point
├── theme.dart               # Theme configuration
├── navigation/
│   └── main_navigation.dart # Bottom tab navigation
├── screens/                 # Main app screens
│   ├── explore_screen.dart
│   ├── wishlists_screen.dart
│   ├── bookings_screen.dart
│   ├── messages_screen.dart
│   └── profile_screen.dart
├── widgets/                 # Reusable UI components
│   ├── search_header.dart
│   ├── category_chips.dart
│   ├── item_card.dart
│   └── filters_bottom_sheet.dart
├── models/                  # Data models
│   ├── user.dart
│   ├── item.dart
│   └── category.dart
└── services/               # Business logic
    └── data_service.dart   # Data management
```

### State Management
- **Local State**: StatefulWidget for UI interactions
- **Data Persistence**: SharedPreferences for local storage
- **Future Migration**: Ready for Provider/Riverpod if needed

## Sample Data

### Categories (6 Main)
1. Werkzeuge & Bau
2. Elektronik  
3. Foto & Video
4. Sport & Fitness
5. Outdoor & Camping
6. Fahrzeuge

### Sample Items (3 Examples)
- Bosch Schlagbohrmaschine (Berlin, 15€/Tag)
- Canon EOS R5 Kamera (München, 89€/Tag)
- Kettlebell Set (Hamburg, 12€/Tag)

### Sample Users (3 Profiles)
- Max Mustermann (Berlin, verified, 4.8★)
- Sarah Schmidt (München, verified, 4.9★)
- Thomas Weber (Hamburg, 4.5★)

## Development Priorities

### MVP Features Implemented
1. ✅ Navigation structure with 5 tabs
2. ✅ Theme system with correct colors
3. ✅ Data models and local storage
4. ✅ Basic screens for all main functions
5. ✅ Search and filtering UI
6. ✅ Category system
7. ✅ Sample data for demonstration

### Next Phase (Ready for Extension)
- Item detail pages with booking flow
- User authentication and profiles
- Advanced search with geolocation
- Payment integration (Stripe Connect)
- Real-time messaging
- Firebase/Firestore integration
- Admin panel for content moderation
- Advanced filtering and sorting
- Review and rating system
- Push notifications

## Responsive Design
- **Mobile First**: Optimized for phones (2-column grids)
- **Tablet Ready**: Adaptive layouts with more columns
- **Web Compatible**: Responsive breakpoints planned

This architecture provides a solid foundation for a complete peer-to-peer rental marketplace while maintaining the familiar Airbnb-like user experience.
