import React, { useMemo } from "react";
import { SelectField } from "./select-field";
import { supportedTimezones } from "./timezones";

export function TimezoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(
    () =>
      supportedTimezones(value).map((zone) => ({
        value: zone,
        label: zone.replaceAll("_", " "),
      })),
    [value],
  );
  return (
    <SelectField
      label="Timezone"
      value={value}
      options={options}
      onChange={onChange}
      searchable
    />
  );
}
