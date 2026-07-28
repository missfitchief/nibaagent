import { describe, it, expect } from "vitest";
import { detectOrderIntent } from "../src/lib/engine";

/**
 * Real prod bug: detectOrderIntent's bare-stem check (/naruc/i, /poruc/i)
 * matches ANY word containing that stem, including past-tense claims
 * ("naručila sam" — I already ordered) and "I'll order elsewhere"
 * complaints ("da naručim negdje drugo") — neither is fresh intent to place
 * a new order with THIS business, but both fired the full "nothing known
 * yet" order-collection template, twice in a row, in a real conversation.
 */
describe("detectOrderIntent", () => {
  it("fires on genuine fresh intent", () => {
    expect(detectOrderIntent("Zelim da naručim narukvicu")).toBe(true);
    expect(detectOrderIntent("Hocu da poručim ovaj prsten")).toBe(true);
    expect(detectOrderIntent("I want to order this")).toBe(true);
    expect(detectOrderIntent("naručujem odmah")).toBe(true);
    expect(detectOrderIntent("naruči mi jedan")).toBe(true);
  });

  it("does NOT fire on a past-tense claim of an existing order", () => {
    expect(detectOrderIntent("Pa naručila sam u četvrtak prošle sedmice")).toBe(false);
    expect(detectOrderIntent("Naručio sam juče")).toBe(false);
    expect(detectOrderIntent("Poručili smo dvoje")).toBe(false);
    expect(detectOrderIntent("Vec sam narucila")).toBe(false);
  });

  it("does NOT fire on a complaint about ordering elsewhere", () => {
    expect(detectOrderIntent("Ako nece sutra stici onda da naručim negdje drugo")).toBe(false);
    expect(detectOrderIntent("Naruciću drugdje ako ne stigne")).toBe(false);
  });

  it("a past-tense claim next to explicit fresh intent still fires (strong pattern wins)", () => {
    expect(detectOrderIntent("Naručila sam ranije, ali sad želim da naručim još nešto")).toBe(true);
  });

  it("no order-related words at all → false", () => {
    expect(detectOrderIntent("Postovanje")).toBe(false);
    expect(detectOrderIntent("Hoce li moja narudžba brzo stici")).toBe(false);
  });
});
