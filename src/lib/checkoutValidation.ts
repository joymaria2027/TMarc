export interface CheckoutValues {
  fullName: string;
  phone: string;
  fulfillment: "pickup" | "delivery";
  address: string;
}

export type CheckoutErrorKey = "fullName" | "phone" | "address";
export type CheckoutErrors = Partial<Record<CheckoutErrorKey, string>>;

export const CHECKOUT_FIELD_IDS: Record<CheckoutErrorKey, string> = {
  fullName: "checkout-fullname",
  phone: "checkout-phone",
  address: "checkout-address",
};

export function validateCheckout(v: CheckoutValues): CheckoutErrors {
  const errors: CheckoutErrors = {};
  if (!v.fullName.trim()) errors.fullName = "Enter your full name.";
  if (!v.phone.trim()) {
    errors.phone = "Enter a phone number so the merchant can reach you.";
  } else if (v.phone.trim().length < 6) {
    errors.phone = "Enter a valid phone number.";
  }
  if (v.fulfillment === "delivery" && !v.address.trim()) {
    errors.address = "Enter a delivery address.";
  }
  return errors;
}

export function firstInvalidField(errors: CheckoutErrors): string | null {
  if (errors.fullName) return CHECKOUT_FIELD_IDS.fullName;
  if (errors.phone) return CHECKOUT_FIELD_IDS.phone;
  if (errors.address) return CHECKOUT_FIELD_IDS.address;
  return null;
}
