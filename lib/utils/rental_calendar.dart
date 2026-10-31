/// Rental ranges use calendar dates with an exclusive end, not elapsed hours.
/// Keep this separate from the exact handover/return contract instants.
DateTime rentalCalendarDate(DateTime value) =>
    DateTime(value.year, value.month, value.day);

DateTime addRentalCalendarDays(DateTime value, int days) =>
    DateTime(value.year, value.month, value.day + days);

int rentalCalendarDays(DateTime start, DateTime end) =>
    DateTime.utc(end.year, end.month, end.day)
        .difference(DateTime.utc(start.year, start.month, start.day))
        .inDays;
