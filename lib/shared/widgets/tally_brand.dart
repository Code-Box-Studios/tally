import 'package:flutter/material.dart';

class TallyBrand extends StatelessWidget {
  const TallyBrand({super.key, this.size = 34});
  final double size;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: size + 1,
        height: size + 3,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primary,
          borderRadius: BorderRadius.circular(11),
        ),
        padding: const EdgeInsets.all(6),
        child: CustomPaint(
          painter: _TallyMark(Theme.of(context).colorScheme.onPrimary),
        ),
      ),
      const SizedBox(width: 10),
      Flexible(
        child: FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text.rich(
            textScaler: TextScaler.noScaling,
            TextSpan(
              text: 'tally',
              children: [
                TextSpan(
                  text: '.',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
            style: TextStyle(
              fontFamily: 'Manrope',
              fontSize: size,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.8,
            ),
          ),
        ),
      ),
    ],
  );
}

class _TallyMark extends CustomPainter {
  const _TallyMark(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.7
      ..strokeCap = StrokeCap.round;
    for (final x in [.25, .5, .75]) {
      canvas.drawLine(
        Offset(size.width * x, size.height * .15),
        Offset(size.width * x, size.height * .85),
        paint,
      );
    }
    canvas.drawLine(
      Offset(size.width * .1, size.height * .75),
      Offset(size.width * .9, size.height * .3),
      paint,
    );
  }

  @override
  bool shouldRepaint(_TallyMark oldDelegate) => oldDelegate.color != color;
}
