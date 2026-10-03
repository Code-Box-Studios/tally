import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ThemeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => ThemeMode.system;
  void setMode(ThemeMode mode) => state = mode;
}

final themeModeProvider = NotifierProvider<ThemeController, ThemeMode>(
  ThemeController.new,
);
