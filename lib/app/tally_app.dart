import 'package:flutter/material.dart';

class TallyApp extends StatelessWidget {
  const TallyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Tally',
      home: Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [Text('Tally'), Text('Know what’s due.')],
          ),
        ),
      ),
    );
  }
}
