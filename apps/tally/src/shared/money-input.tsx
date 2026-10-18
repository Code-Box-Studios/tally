import React, { useRef, useState } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { formatMoneyInput } from "../core/domain/money";

type Selection = { start: number; end: number };

function changedRange(previous: string, next: string, selection?: Selection) {
  if (selection) {
    const { start, end } = selection;
    const inserted = next.length - (previous.length - (end - start));
    if (
      inserted >= 0 &&
      next.slice(0, start) === previous.slice(0, start) &&
      next.slice(start + inserted) === previous.slice(end)
    ) {
      return { start, end, nextEnd: start + inserted };
    }
    const removed = previous.length - next.length;
    if (start === end && removed > 0) {
      if (
        start >= removed &&
        next === previous.slice(0, start - removed) + previous.slice(start)
      ) {
        return { start: start - removed, end: start, nextEnd: start - removed };
      }
      if (next === previous.slice(0, start) + previous.slice(start + removed)) {
        return { start, end: start + removed, nextEnd: start };
      }
    }
  }
  let start = 0;
  while (start < previous.length && previous[start] === next[start]) start++;
  let end = previous.length;
  let nextEnd = next.length;
  while (
    end > start &&
    nextEnd > start &&
    previous[end - 1] === next[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  return { start, end, nextEnd };
}

function formattedOffset(value: string, rawOffset: number): number {
  let position = 0;
  let characters = 0;
  while (position < value.length && characters < rawOffset) {
    if (value[position] !== ",") characters++;
    position++;
  }
  return position;
}

export function MoneyInput({
  value = "",
  onChangeText,
  onSelectionChange,
  selection: requestedSelection,
  ...props
}: TextInputProps) {
  const display = formatMoneyInput(value);
  const selectionRef = useRef<Selection | undefined>(undefined);
  const [selection, setSelection] = useState<Selection>();
  return (
    <TextInput
      {...props}
      value={display}
      selection={requestedSelection ?? selection}
      onSelectionChange={(event) => {
        selectionRef.current = event.nativeEvent.selection;
        setSelection(event.nativeEvent.selection);
        onSelectionChange?.(event);
      }}
      onChangeText={(next) => {
        const edit = changedRange(display, next, selectionRef.current);
        let raw = next.replaceAll(",", "");
        let rawCaret = next.slice(0, edit.nextEnd).replaceAll(",", "").length;
        const previousSelection = selectionRef.current;
        if (
          previousSelection?.start === previousSelection?.end &&
          (previousSelection?.start === edit.start ||
            previousSelection?.start === edit.end) &&
          display.slice(edit.start, edit.end) === "," &&
          edit.nextEnd === edit.start
        ) {
          // Removing a generated comma should delete a digit instead of getting stuck.
          const index =
            previousSelection?.start === edit.end ? rawCaret - 1 : rawCaret;
          if (/\d/.test(raw[index] ?? "")) {
            raw = raw.slice(0, index) + raw.slice(index + 1);
            rawCaret = index;
          }
        }
        const caret = formattedOffset(formatMoneyInput(raw), rawCaret);
        const nextSelection = { start: caret, end: caret };
        selectionRef.current = nextSelection;
        setSelection(nextSelection);
        onChangeText?.(raw);
      }}
    />
  );
}
