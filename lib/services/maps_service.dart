import 'backend_repository.dart';

class MapsService {
  static Future<List<MapsAddressSuggestion>> autocomplete(
    String input, {
    String language = 'de',
    String country = 'de',
  }) async {
    final results = await BackendRepository.autocompleteAddresses(
      input: input,
      language: language,
      country: country,
    );
    return results
        .map((entry) {
          return MapsAddressSuggestion(
            description: entry['description']?.toString() ?? '',
            placeId: entry['placeId']?.toString(),
          );
        })
        .where((entry) => entry.description.isNotEmpty && entry.placeId != null)
        .toList();
  }

  static Future<PlaceDetails?> placeDetails(
    String placeId, {
    String language = 'de',
  }) async {
    final result = await BackendRepository.getAddressPlaceDetails(
      placeId: placeId,
      language: language,
    );
    final formatted = result?['formattedAddress'] as String?;
    final lat = (result?['lat'] as num?)?.toDouble();
    final lng = (result?['lng'] as num?)?.toDouble();
    if (formatted == null || lat == null || lng == null) return null;
    return PlaceDetails(formattedAddress: formatted, lat: lat, lng: lng);
  }
}

class MapsAddressSuggestion {
  final String description;
  final String? placeId;
  const MapsAddressSuggestion(
      {required this.description, required this.placeId});
}

class PlaceDetails {
  final String formattedAddress;
  final double lat;
  final double lng;
  const PlaceDetails(
      {required this.formattedAddress, required this.lat, required this.lng});
}
