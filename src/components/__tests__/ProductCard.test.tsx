import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProductCard from "../ProductCard";

const base = {
  id: "p1",
  merchant_id: "m1",
  name: "Benachin",
  description: "Tasty rice",
  price: 150,
  quantity: 5,
  track_inventory: true,
  available_today: true,
  image_path: null,
};

function renderCard(props: Partial<Parameters<typeof ProductCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ProductCard
        product={base}
        merchantName="Mama's Kitchen"
        imageUrl={null}
        quote={{ price: 150, retailPrice: 150, isWholesale: false, minQty: 1 }}
        canBuy
        onAdd={() => {}}
        {...props}
      />
    </MemoryRouter>
  );
}

describe("ProductCard (shared ShopPage + MerchantStorefrontPage)", () => {
  it("renders a designed no-image state (not a bare string)", () => {
    renderCard();
    expect(screen.getByText("No image available")).toBeInTheDocument();
  });

  it("renders the image with product alt when a URL is present", () => {
    renderCard({ imageUrl: "https://example.com/img.jpg" });
    expect(screen.getByAltText("Benachin")).toBeInTheDocument();
  });

  it("labels the add button with the product name and fires onAdd", () => {
    const onAdd = vi.fn();
    renderCard({ onAdd });
    const btn = screen.getByRole("button", { name: "Add Benachin to cart" });
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows wholesale pricing with strikethrough retail", () => {
    renderCard({ quote: { price: 120, retailPrice: 150, isWholesale: true, minQty: 10 } });
    expect(screen.getByText(/Wholesale · min 10/)).toBeInTheDocument();
  });

  it("shows out-of-stock badge and disables add", () => {
    renderCard({
      product: { ...base, quantity: 0 },
      canBuy: false,
    });
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Benachin to cart" })).toBeDisabled();
  });
});
