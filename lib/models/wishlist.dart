/// Wishlist model used for local persistence.
///
/// id: unique identifier
/// name: display name
/// system: true for one of the three predefined lists
class Wishlist {
  final String id;
  final String name;
  final bool system;

  const Wishlist({required this.id, required this.name, required this.system});

  Wishlist copyWith({String? id, String? name, bool? system}) => Wishlist(
        id: id ?? this.id,
        name: name ?? this.name,
        system: system ?? this.system,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'system': system,
      };

  static Wishlist fromJson(Map<String, dynamic> json) => Wishlist(
        id: (json['id'] ?? '').toString(),
        name: (json['name'] ?? '').toString(),
        system: json['system'] == true,
      );

  @override
  String toString() => 'Wishlist(id=$id, name=$name, system=$system)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Wishlist && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
