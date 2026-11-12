import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { TonkApiError } from "@/shared/tonk/api";
import { ImagePicker } from "@/shared/tonk/ImagePicker";

const HOST = "abc123store.public.blob.vercel-storage.com";
const IMAGE = `https://${HOST}/token-art/${"a".repeat(64)}.webp`;
const OWNER = "0x3daa6db67596ce7633caa7ef42ca074a73db9490";
const ti = en.tokenImage;

const mocks = vi.hoisted(() => ({ accounts: {} as Record<string, string>, upload: vi.fn<() => Promise<string>>() }));
vi.mock("@/shared/wallet/wallet", () => ({ useWallet: () => ({ phase: "ready", pending: false, chain: null, address: null, accounts: mocks.accounts }), wallet: {} }));
vi.mock("@/shared/tonk/upload-image", async (actual) => ({ ...(await actual<typeof import("@/shared/tonk/upload-image")>()), uploadTokenImage: mocks.upload }));

/** A form like Launch's: its change handler closes over the form as it was rendered. */
function Form() {
  const [form, setForm] = useState({ name: "", image: "" });
  return (
    <>
      <input aria-label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <ImagePicker layout="card" label="Token image" value={form.image} onChange={(image) => setForm({ ...form, image })} preview={<span />} />
      <output>{JSON.stringify(form)}</output>
    </>
  );
}

const pick = (type = "image/png", size = 10) => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(size)], "art", { type })] } });
};

describe("the token image picker", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_TONK_IMAGE_HOST", HOST);
    mocks.accounts = { rh: OWNER };
    mocks.upload.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("says when images aren't set up, or a wallet is needed, and offers nothing to click", () => {
    vi.stubEnv("NEXT_PUBLIC_TONK_IMAGE_HOST", "*.public.blob.vercel-storage.com");
    const { unmount } = render(<Form />);
    expect(screen.getByText(ti.notSetUp)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    vi.stubEnv("NEXT_PUBLIC_TONK_IMAGE_HOST", HOST);
    mocks.accounts = {};
    render(<Form />);
    expect(screen.getByText(ti.connect)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("checks the file before anything is signed, and words the server's refusals", async () => {
    render(<Form />);
    expect(screen.getByRole("button", { name: ti.choose })).toBeEnabled();
    pick("image/svg+xml");
    expect(screen.getByText(ti.errors.type)).toBeInTheDocument();
    pick("image/png", 2 * 1024 * 1024 + 1);
    expect(screen.getByText(ti.errors.size)).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
    mocks.upload.mockRejectedValueOnce(new TonkApiError("limit"));
    await act(async () => pick());
    expect(screen.getByText(ti.errors.limit)).toBeInTheDocument();
    mocks.upload.mockRejectedValueOnce(new TonkApiError("invite"));
    await act(async () => pick());
    expect(screen.getByText(ti.inviteOnly)).toBeInTheDocument();
  });

  it("keeps what was typed while the wallet and the upload took their time", async () => {
    let finish: (url: string) => void = () => undefined;
    mocks.upload.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    render(<Form />);
    act(() => pick());
    expect(screen.getByText(ti.sign)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ti.choose })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Astro Pup" } });
    await act(async () => finish(IMAGE));
    expect(JSON.parse(screen.getByRole("status").textContent ?? "")).toEqual({ name: "Astro Pup", image: IMAGE });
    expect(screen.getByText(ti.done)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: ti.remove }));
    expect(JSON.parse(screen.getByRole("status").textContent ?? "")).toEqual({ name: "Astro Pup", image: "" });
    expect(screen.getByText(ti.removed)).toBeInTheDocument();
  });
});
