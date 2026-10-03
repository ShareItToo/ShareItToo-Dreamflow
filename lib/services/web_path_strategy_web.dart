import 'package:flutter_web_plugins/url_strategy.dart';

// Only URL serialization changes. Navigator-1 history remains Phase B work.
void configureCleanWebPaths() => usePathUrlStrategy();
