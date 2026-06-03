// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TelemetryProvider, useTelemetry, useTrackPageView, WTS } from "../src/react.js";

let capturedRequests: { url: string; init: RequestInit }[] = [];
(globalThis as any).fetch = async (url: string, init: RequestInit) => {
  capturedRequests.push({ url, init });
  return new Response(null, { status: 200 });
};

test("react entrypoint exports the expected API", () => {
  expect(typeof TelemetryProvider).toBe("function");
  expect(typeof useTelemetry).toBe("function");
  expect(typeof useTrackPageView).toBe("function");
  expect(typeof WTS).toBe("function");
});

test("useTelemetry throws when used outside TelemetryProvider", () => {
  function Orphan() {
    useTelemetry();
    return null;
  }
  expect(() => render(<Orphan />)).toThrow(
    "useTelemetry must be used inside a <TelemetryProvider>."
  );
});

test("useTelemetry returns a WTS client inside TelemetryProvider", () => {
  let client: WTS | null = null;
  function Consumer() {
    client = useTelemetry();
    return null;
  }

  render(
    <TelemetryProvider source="site">
      <Consumer />
    </TelemetryProvider>
  );

  expect(client).not.toBeNull();
  expect(client).toBeInstanceOf(WTS);
});

test("TelemetryProvider allows tracking events", async () => {
  capturedRequests = [];

  function TrackButton() {
    const wts = useTelemetry();
    return <button onClick={() => wts.track("click")}>Track</button>;
  }

  render(
    <TelemetryProvider source="site" apiUrl="https://t.example.com">
      <TrackButton />
    </TelemetryProvider>
  );

  act(() => {
    screen.getByText("Track").click();
  });

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequests.length).toBeGreaterThanOrEqual(1);
  const body = JSON.parse(capturedRequests[0]!.init.body as string);
  expect(body.event).toBe("click");
  expect(body.source).toBe("site");
});

test("useTrackPageView fires page-view on path change", async () => {
  capturedRequests = [];

  function PageTracker({ path }: { path: string }) {
    useTrackPageView(path);
    return null;
  }

  const { rerender } = render(
    <TelemetryProvider source="site" apiUrl="https://t.example.com">
      <PageTracker path="/home" />
    </TelemetryProvider>
  );

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequests.length).toBeGreaterThanOrEqual(1);
  const body1 = JSON.parse(capturedRequests[0]!.init.body as string);
  expect(body1.event).toBe("page-view");

  const countBefore = capturedRequests.length;
  rerender(
    <TelemetryProvider source="site" apiUrl="https://t.example.com">
      <PageTracker path="/about" />
    </TelemetryProvider>
  );

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequests.length).toBeGreaterThan(countBefore);
});

test("useTrackPageView does not fire on same path rerender", async () => {
  capturedRequests = [];

  function PageTracker({ path }: { path: string }) {
    useTrackPageView(path);
    return null;
  }

  const { rerender } = render(
    <TelemetryProvider source="site" apiUrl="https://t.example.com">
      <PageTracker path="/home" />
    </TelemetryProvider>
  );

  await new Promise(r => setTimeout(r, 10));
  const countAfterFirst = capturedRequests.length;

  rerender(
    <TelemetryProvider source="site" apiUrl="https://t.example.com">
      <PageTracker path="/home" />
    </TelemetryProvider>
  );

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequests.length).toBe(countAfterFirst);
});

test("useTrackPageView skips null/undefined path", async () => {
  capturedRequests = [];

  function PageTracker({ path }: { path: string | null }) {
    useTrackPageView(path);
    return null;
  }

  render(
    <TelemetryProvider source="site" apiUrl="https://t.example.com">
      <PageTracker path={null} />
    </TelemetryProvider>
  );

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequests).toHaveLength(0);
});
