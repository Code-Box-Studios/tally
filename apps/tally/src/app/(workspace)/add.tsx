import React from "react";
import { Page, Heading } from "../../shared/ui";
import { ObligationForm } from "../../features/obligations/obligation-form";
export default function Add() {
  return (
    <Page>
      <Heading
        title="Something to remember."
        subtitle="Add what you owe, what’s owed to you, or a recurring due."
      />
      <ObligationForm />
    </Page>
  );
}
