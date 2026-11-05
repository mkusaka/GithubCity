// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const sceneMocks = vi.hoisted(() => ({
  clearScene: vi.fn(),
  createScene: vi.fn(() => ({ scene: {}, controls: { autoRotate: true } })),
  renderBuilding: vi.fn(),
  renderGrass: vi.fn(),
  renderRoad: vi.fn(),
  changeShadowPreset: vi.fn(),
  convertSceneToStlBlob: vi.fn(),
}));
const apiMocks = vi.hoisted(() => ({
  fetchContributions: vi.fn(),
  getConvertedContributions: vi.fn(() => [[1]]),
  getLoginUrl: vi.fn(
    (returnTo: string) => `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
  ),
}));

vi.mock("./scene", () => sceneMocks);
vi.mock("./api", () => apiMocks);
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

async function mount(path = "/") {
  window.history.replaceState({}, "", new URL(path, window.location.origin));
  document.body.innerHTML = `<canvas id="bg"></canvas><button id="autorotate"></button><button id="download"></button><select id="yearSelect"><option value="2025">2025</option></select><input id="usernameInput" value="octocat"><form id="infoForm"></form><div id="selectionScreen"></div><a id="title"></a><div id="displayInfo"></div><p id="errorMessage"></p><a id="signInLink"></a><input id="shadowPreset" value="1">`;
  // Import after DOM setup so main's module-level lookups bind to this test's fixture.
  await import("./main");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  apiMocks.getConvertedContributions.mockReturnValue([[1]]);
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("main sign-in and generation flow", () => {
  test("401 shows login link, preserves query return path, and leaves selection visible", async () => {
    apiMocks.fetchContributions.mockResolvedValue(401);
    await mount("/?name=octocat&year=2025");
    expect(location.search).toBe("?name=octocat&year=2025");
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLAnchorElement>("#signInLink")!.style.display).toBe(
        "inline-block",
      ),
    );
    const link = document.querySelector<HTMLAnchorElement>("#signInLink")!;
    expect(link.href).toContain(encodeURIComponent("/?name=octocat&year=2025"));
    expect(document.querySelector("#selectionScreen")!.classList.contains("hidden")).toBe(false);
  });

  test("other failure shows error, while successful fetch hides selection and renders", async () => {
    apiMocks.fetchContributions.mockResolvedValueOnce(null);
    await mount("/?name=octocat&year=2025");
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLElement>("#errorMessage")!.style.display).toBe("block"),
    );

    vi.resetModules();
    apiMocks.fetchContributions.mockResolvedValueOnce([{ contributionDays: [] }]);
    await mount("/?name=octocat&year=2025");
    await vi.waitFor(() =>
      expect(document.querySelector("#selectionScreen")!.classList.contains("hidden")).toBe(true),
    );
    expect(sceneMocks.renderBuilding).toHaveBeenCalled();
  });

  test("form submission replaces query before requesting data", async () => {
    let queryAtRequest = "";
    apiMocks.fetchContributions.mockImplementation(async () => {
      queryAtRequest = window.location.search;
      return 401;
    });
    await mount("/");
    const event = new Event("submit", { bubbles: true, cancelable: true });
    document.querySelector("#infoForm")!.dispatchEvent(event);
    await vi.waitFor(() =>
      expect(apiMocks.fetchContributions).toHaveBeenCalledWith("octocat", "2025"),
    );
    expect(queryAtRequest).toBe("?name=octocat&year=2025");
    expect(window.location.search).toBe(queryAtRequest);
  });
});
