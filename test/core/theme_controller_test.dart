import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tally/core/theme/theme_controller.dart';
import 'package:tally/shared/layout/breakpoints.dart';

void main() {
  test('Theme selection updates all three modes', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    expect(container.read(themeModeProvider), ThemeMode.system);
    for (final mode in [ThemeMode.light, ThemeMode.dark, ThemeMode.system]) {
      container.read(themeModeProvider.notifier).setMode(mode);
      expect(container.read(themeModeProvider), mode);
    }
  });
  test('Width boundaries preserve compact, rail and sidebar layouts', () {
    expect(layoutClassFor(599), LayoutClass.compact);
    expect(layoutClassFor(600), LayoutClass.medium);
    expect(layoutClassFor(1023), LayoutClass.medium);
    expect(layoutClassFor(1024), LayoutClass.expanded);
  });
}
