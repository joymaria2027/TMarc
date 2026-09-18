import { describe, it, expect } from "vitest";
import { validateCheckout, firstInvalidField } from "../checkoutValidation";

describe("validateCheckout (checkout inline errors)", () => {
  it("requires full name and phone", () => {
    const errors = validateCheckout({ fullName: "", phone: "", fulfillment: "pickup", address: "" });
    expect(errors.fullName).toBeTruthy();
    expect(errors.phone).toBeTruthy();
    expect(errors.address).toBeUndefined();
  });

  it("requires address for delivery but not pickup", () => {
    const delivery = validateCheckout({ fullName: "Ama", phone: "0712345", fulfillment: "delivery", address: "" });
    expect(delivery.address).toBeTruthy();
    const pickup = validateCheckout({ fullName: "Ama", phone: "0712345", fulfillment: "pickup", address: "" });
    expect(pickup.address).toBeUndefined();
  });

  it("rejects short phone numbers", () => {
    const errors = validateCheckout({ fullName: "Ama", phone: "123", fulfillment: "pickup", address: "" });
    expect(errors.phone).toBeTruthy();
  });

  it("passes with valid delivery values", () => {
    const errors = validateCheckout({ fullName: "Ama Serwaa", phone: "071234567", fulfillment: "delivery", address: "12 Kairaba Ave" });
    expect(errors).toEqual({});
  });
});

describe("firstInvalidField (focus order)", () => {
  it("focuses full name first, then phone, then address", () => {
    expect(firstInvalidField({ fullName: "x", phone: "x", address: "x" })).toBe("checkout-fullname");
    expect(firstInvalidField({ phone: "x", address: "x" })).toBe("checkout-phone");
    expect(firstInvalidField({ address: "x" })).toBe("checkout-address");
    expect(firstInvalidField({})).toBeNull();
  });
});
