import 'package:flutter/material.dart';

abstract final class TallyTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final ink = Color(dark ? 0xffe6ece5 : 0xff26332d);
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xff3c6653),
      brightness: brightness,
      primary: Color(dark ? 0xff9dc4a8 : 0xff3c6653),
      surface: Color(dark ? 0xff1d2721 : 0xffffffff),
      onSurface: ink,
    );
    final colors = scheme.copyWith(
      primaryContainer: Color(dark ? 0xff2d4435 : 0xffedf4ee),
      outlineVariant: Color(dark ? 0xff344137 : 0xffe6e9e2),
      onSurfaceVariant: Color(dark ? 0xffa2aea3 : 0xff778078),
    );
    return ThemeData(
      useMaterial3: true,
      fontFamily: 'DM Sans',
      colorScheme: colors,
      scaffoldBackgroundColor: Color(dark ? 0xff151d19 : 0xfff6f7f4),
      textTheme: TextTheme(
        bodyLarge: TextStyle(fontSize: 14, height: 1.5, color: ink),
        bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: ink),
        titleLarge: TextStyle(
          fontFamily: 'Manrope',
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: ink,
        ),
        headlineMedium: TextStyle(
          fontFamily: 'Manrope',
          fontSize: 29,
          letterSpacing: -1.1,
          fontWeight: FontWeight.w700,
          color: ink,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: colors.outlineVariant),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surface,
      ),
      dividerTheme: DividerThemeData(color: colors.outlineVariant),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: colors.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: colors.outlineVariant),
        ),
      ),
    );
  }
}
