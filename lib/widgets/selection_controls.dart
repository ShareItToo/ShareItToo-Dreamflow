import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lendify/theme.dart';

/// A hollow circular indicator with a centered dot when selected.
/// Matches the filter sheet's "blue dot in circle" design.
class DotCircleIndicator extends StatelessWidget {
  final bool selected;
  final Color dotColor;
  final double size;
  const DotCircleIndicator(
      {super.key,
      required this.selected,
      required this.dotColor,
      this.size = 18});

  @override
  Widget build(BuildContext context) {
    final borderColor = Theme.of(context).brightness == Brightness.dark
        ? Colors.white54
        : AppTheme.textDisabled(context);
    final innerSize = size * 0.44;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(alignment: Alignment.center, children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: borderColor, width: 1.6)),
        ),
        if (selected)
          Container(
            width: innerSize,
            height: innerSize,
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
      ]),
    );
  }
}

/// Text option with a DotCircleIndicator. Use for radio/toggle-like selections.
class ToggleTextOption extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final EdgeInsets padding;
  const ToggleTextOption(
      {super.key,
      required this.label,
      required this.selected,
      required this.onTap,
      this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 6)});

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Focus(
      onKeyEvent: (_, event) {
        if (event is KeyDownEvent &&
            (event.logicalKey == LogicalKeyboardKey.enter ||
                event.logicalKey == LogicalKeyboardKey.space)) {
          onTap();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: Semantics(
        key: ValueKey('toggle-text-option-$label'),
        container: true,
        button: true,
        selected: selected,
        label: label,
        onTap: onTap,
        child: ExcludeSemantics(
          child: ConstrainedBox(
            constraints:
                const BoxConstraints(minHeight: kMinInteractiveDimension),
            child: InkWell(
              canRequestFocus: false,
              onTap: onTap,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: padding,
                child: Row(children: [
                  DotCircleIndicator(selected: selected, dotColor: primary),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(label,
                        style: TextStyle(
                            color: selected
                                ? primary
                                : (Theme.of(context).brightness ==
                                        Brightness.dark
                                    ? Colors.white
                                    : AppTheme.textBody(context)),
                            fontWeight:
                                selected ? FontWeight.w700 : FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                        softWrap: false),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
