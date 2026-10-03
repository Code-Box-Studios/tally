enum LayoutClass { compact, medium, expanded }

LayoutClass layoutClassFor(double width) => switch (width) {
  < 600 => LayoutClass.compact,
  < 1024 => LayoutClass.medium,
  _ => LayoutClass.expanded,
};
