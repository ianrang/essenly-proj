import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("client-only", () => ({}));

const mockAuthFetch = vi.fn();
vi.mock("@/client/core/auth-fetch", () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import KitCtaSheet from "./KitCtaSheet";

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockToastError.mockReset();
});

const renderSheet = (open = true) => {
  const onOpenChange = vi.fn();
  const utils = render(
    <KitCtaSheet open={open} onOpenChange={onOpenChange} />,
  );
  return { ...utils, onOpenChange };
};

describe("KitCtaSheet", () => {
  it("open=true → 이메일 입력 + Claim 버튼 렌더링", () => {
    renderSheet(true);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claim my free kit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to chat/i })).toBeInTheDocument();
  });

  it("빈 이메일 제출 → 'Email is required' 에러 메시지", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));
    await waitFor(() => {
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it("잘못된 이메일 제출 → 'Please enter a valid email' 에러 메시지", async () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.submit(document.getElementById("kit-claim-form")!);
    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email")).toBeInTheDocument();
    });
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it("유효한 이메일 제출 → 201 → 성공 화면 표시", async () => {
    mockAuthFetch.mockResolvedValue({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ data: { status: "claimed" } }),
    });
    renderSheet();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));
    await waitFor(() => {
      expect(screen.getByText("Thank you!")).toBeInTheDocument();
    });
    expect(mockAuthFetch).toHaveBeenCalledWith(
      "/api/kit/claim",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "user@example.com", marketing_consent: false }),
      }),
    );
  });

  it("409 응답 → 성공으로 처리 (Q-12 멱등성)", async () => {
    mockAuthFetch.mockResolvedValue({ status: 409, ok: false });
    renderSheet();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "dup@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));
    await waitFor(() => {
      expect(screen.getByText("Thank you!")).toBeInTheDocument();
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("500 응답 → toast.error 표시", async () => {
    mockAuthFetch.mockResolvedValue({
      status: 500,
      ok: false,
      json: () => Promise.resolve({ error: { message: "Failed to process kit claim" } }),
    });
    renderSheet();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to process kit claim");
    });
  });

  it("네트워크 에러 → 폴백 toast.error 표시", async () => {
    mockAuthFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    renderSheet();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to fetch");
    });
  });

  it("Back to chat 클릭 → onOpenChange(false) 호출", () => {
    const { onOpenChange } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /Back to chat/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("성공 후 Back to chat 클릭 → onOpenChange(false) 호출", async () => {
    mockAuthFetch.mockResolvedValue({ status: 201, ok: true, json: () => Promise.resolve({}) });
    const { onOpenChange } = renderSheet();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));
    await waitFor(() => { expect(screen.getByText("Thank you!")).toBeInTheDocument(); });
    fireEvent.click(screen.getByRole("button", { name: /Back to chat/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("marketing consent 체크 → POST body에 marketing_consent: true", async () => {
    mockAuthFetch.mockResolvedValue({ status: 201, ok: true, json: () => Promise.resolve({}) });
    renderSheet();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));
    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        "/api/kit/claim",
        expect.objectContaining({
          body: JSON.stringify({ email: "user@example.com", marketing_consent: true }),
        }),
      );
    });
  });

  it("성공 후 sheet close → reopen → 성공 화면 유지 (claimed state preserved)", async () => {
    mockAuthFetch.mockResolvedValue({ status: 201, ok: true, json: () => Promise.resolve({}) });
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <KitCtaSheet open={true} onOpenChange={onOpenChange} />,
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));
    await waitFor(() => { expect(screen.getByText("Thank you!")).toBeInTheDocument(); });
    rerender(<KitCtaSheet open={false} onOpenChange={onOpenChange} />);
    rerender(<KitCtaSheet open={true} onOpenChange={onOpenChange} />);
    expect(screen.getByText("Thank you!")).toBeInTheDocument();
  });
});
