import React from "react";
import { Page, Heading } from "../../shared/ui";
import { ObligationForm } from "../../features/obligations/obligation-form";
export default function Add() {
  return (
    <Page maxWidth={1000}>
      <Heading
        title="A little detail. A lot of clarity."
        subtitle="Add an obligation. Tally will help you keep track of what comes next."
      />
      <ObligationForm />
    </Page>
  );
}
