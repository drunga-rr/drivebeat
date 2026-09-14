// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { LocalLibraryStorageError } from "@/lib/localLibraryStore";

const { loadStoredTracksMock, saveStoredTracksMock, toastMock, toastErrorMock } = vi.hoisted(() => ({ loadStoredTracksMock: vi.fn(), saveStoredTracksMock: vi.fn(), toastMock: vi.fn(), toastErrorMock: vi.fn() }));

vi.mock("@/lib/localLibraryStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/localLibraryStore")>();
  return {
    ...actual,
    loadStoredTracks: loadStoredTracksMock,
    saveStoredTracks: saveStoredTracksMock,
    clearStoredTracks: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: null, isAuthenticated: false, error: null, logout: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: Object.assign(toastMock, { success: vi.fn(), error: toastErrorMock }) }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    googleDrive: {
      status: { useQuery: () => ({ data: undefined, isLoading: false, refetch: vi.fn() }) },
      library: { useQuery: () => ({ data: undefined, isLoading: false }) },
      sync: { useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }) },
      disconnect: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

let objectUrlIndex = 0;
const createObjectUrl = vi.fn(() => `blob:drivebeat-${++objectUrlIndex}`);
const revokeObjectUrl = vi.fn();

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  loadStoredTracksMock.mockResolvedValue([]);
  saveStoredTracksMock.mockResolvedValue(undefined);
  objectUrlIndex = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

describe("Home local audio integration", () => {
  it("configures the fixed sidebar for isolated vertical touch scrolling", async () => {
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector("aside.sidebar")).toBeTruthy());
    const sidebar = container.querySelector("aside.sidebar") as HTMLElement;
    expect(sidebar).toBeTruthy();
    expect(sidebar.style.touchAction).toBe("pan-y");
    expect(sidebar.style.overscrollBehaviorY).toBe("contain");
    expect(sidebar.className).toContain("overflow-y-auto");
    expect(sidebar.className).toContain("overscroll-y-contain");
  });

  it("opens the graphic equalizer and persists its controls", async () => {
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector("aside.sidebar")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: "Equalizador gráfico" })[0]!);
    const equalizerDialog = screen.getByRole("dialog", { name: "Equalizador gráfico" });
    expect(equalizerDialog.className).toContain("left-3");
    expect(equalizerDialog.className).toContain("right-3");
    expect(equalizerDialog.querySelectorAll('input[type="range"]')).toHaveLength(8);
    const vocalPreset = screen.getByRole("button", { name: "Voz" });
    fireEvent.click(vocalPreset);
    expect(vocalPreset.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByRole("slider", { name: "60 Hz" }), { target: { value: "8" } });
    const persisted = JSON.parse(localStorage.getItem("drivebeat-equalizer") ?? "{}");
    expect(persisted.preset).toBe("custom");
    expect(persisted.bands[0]).toBe(8);
    fireEvent.click(screen.getByRole("button", { name: "Desativar" }));
    expect(screen.getByRole("button", { name: "Ativar" })).toBeTruthy();
  });

  it("renders the equalizer open with mobile and tablet layout contracts", async () => {
    window.history.pushState({}, "", "/?equalizer=1");
    render(<Home />);
    const dialog = await screen.findByRole("dialog", { name: "Equalizador gráfico" });
    expect(dialog.className).toContain("left-3");
    expect(dialog.className).toContain("right-3");
    expect(dialog.className).toContain("sm:left-auto");
    expect(dialog.className).toContain("sm:w-[min(560px,calc(100vw-3rem))]");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.querySelectorAll('input[type="range"]')).toHaveLength(8);
    expect(dialog.querySelector('[aria-label="Presets do equalizador"]')).toBeTruthy();
  });

  it("persists favorites and filters the library after remounting", async () => {
    const tracks = [{
      id: "favorite-one", order: 1, title: "Faixa favorita", artist: "Artista", album: "Álbum", folder: "Pasta", duration: "—", accent: "from-violet-500 to-indigo-950", fileName: "favorita.mp3", blob: new Blob(["one"], { type: "audio/mpeg" }),
    }, {
      id: "not-favorite", order: 2, title: "Faixa comum", artist: "Artista", album: "Álbum", folder: "Pasta", duration: "—", accent: "from-cyan-400 to-blue-950", fileName: "comum.mp3", blob: new Blob(["two"], { type: "audio/mpeg" }),
    }];
    loadStoredTracksMock.mockResolvedValue(tracks);
    const { container } = render(<Home />);
    await waitFor(() => expect(screen.getAllByText("Faixa favorita").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: "Favoritar" }));
    expect(JSON.parse(localStorage.getItem("drivebeat-favorites") ?? "[]")).toEqual(["favorite-one"]);
    expect(screen.getByRole("button", { name: "Remover dos favoritos" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Favoritos/ }));
    await waitFor(() => {
      const rows = Array.from(container.querySelectorAll(".track-row")).map((row) => row.textContent ?? "");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain("Faixa favorita");
    });

    cleanup();
    const secondRender = render(<Home />);
    await waitFor(() => expect(screen.getAllByText("Faixa favorita").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /^Favoritos/ }));
    await waitFor(() => expect(secondRender.container.querySelectorAll(".track-row")).toHaveLength(1));
  });

  it("preserves favorites from another source when clearing local tracks", async () => {
    localStorage.setItem("drivebeat-favorites", JSON.stringify(["local-one", "google:drive-file-1"]));
    loadStoredTracksMock.mockResolvedValue([{
      id: "local-one", order: 1, title: "Faixa local", artist: "Artista", album: "Álbum", folder: "Pasta", duration: "—", accent: "from-violet-500 to-indigo-950", fileName: "local.mp3", blob: new Blob(["one"], { type: "audio/mpeg" }),
    }]);
    const { container } = render(<Home />);
    await waitFor(() => expect(screen.getAllByText("Faixa local").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Limpar coleção" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("drivebeat-favorites") ?? "[]")).toEqual(["google:drive-file-1"]));
    expect(container.querySelectorAll(".track-row")).toHaveLength(0);
  });

  it("explains when Google blocks an account outside the test users list", async () => {
    window.history.pushState({}, "", "/?google=error&reason=access_denied");
    render(<Home />);
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(
      "A conta Google ainda não está autorizada para este app.",
      { description: "Adicione esta conta em Google Auth Platform → Audience → Test users e tente novamente." },
    ));
    window.history.replaceState({}, "", "/");
  });

  it("restores persisted tracks in their saved order when the page opens", async () => {
    loadStoredTracksMock.mockResolvedValue([{
      id: "restored-late",
      order: 20,
      title: "Faixa tardia",
      artist: "Arquivo local",
      album: "Álbum restaurado",
      folder: "Minha pasta",
      duration: "—",
      accent: "from-violet-500 to-indigo-950",
      fileName: "tardia.mp3",
      blob: new Blob(["late"], { type: "audio/mpeg" }),
    }, {
      id: "restored-early",
      order: 10,
      title: "Faixa inicial",
      artist: "Arquivo local",
      album: "Álbum restaurado",
      folder: "Minha pasta",
      duration: "—",
      accent: "from-cyan-400 to-blue-950",
      fileName: "inicial.mp3",
      blob: new Blob(["early"], { type: "audio/mpeg" }),
    }]);
    const { container } = render(<Home />);
    await waitFor(() => expect(screen.getAllByText("Faixa inicial").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Faixa tardia").length).toBeGreaterThan(0);
    const rows = Array.from(container.querySelectorAll(".track-row")).map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("Faixa inicial");
    expect(rows[1]).toContain("Faixa tardia");
  });
  it("shows a restoration warning when local storage is blocked", async () => {
    loadStoredTracksMock.mockRejectedValueOnce(new LocalLibraryStorageError("blocked", "blocked"));
    render(<Home />);
    await waitFor(() => expect(screen.getByText("O armazenamento local está bloqueado neste navegador.")).toBeTruthy());
    expect(screen.queryByText(/· salvo/)).toBeNull();
  });

  it("shows a blocking persistence warning when saving exceeds quota", async () => {
    saveStoredTracksMock.mockRejectedValueOnce(new LocalLibraryStorageError("quota-exceeded", "full"));
    const file = new File(["temporary"], "temporary.mp3", { type: "audio/mpeg", lastModified: 9 });
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector('input[type="file"]')).toBeTruthy());
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("Sem espaço para salvar a coleção neste dispositivo.")).toBeTruthy());
    expect(screen.getByText("Armazenamento indisponível")).toBeTruthy();
    expect(screen.queryByText(/1 faixa · salvo/)).toBeNull();
  });

  it("imports local MP3s and drives the real audio element", async () => {
    const first = new File(["first"], "first.mp3", { type: "audio/mpeg", lastModified: 1 });
    const second = new File(["second"], "second.mp3", { type: "audio/mpeg", lastModified: 2 });
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector('input[type="file"]')).toBeTruthy());
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [first, second] } });
    await waitFor(() => expect(screen.getAllByText("first").length).toBeGreaterThan(0));
    expect(screen.getAllByText("second").length).toBeGreaterThan(0);

    const firstRow = screen.getAllByText("first").find((element) => element.closest("button"))?.closest("button");
    expect(firstRow).toBeTruthy();
    fireEvent.click(firstRow!);

    const audio = container.querySelector("audio") as HTMLAudioElement;
    expect(audio.src).toContain("blob:drivebeat");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeTruthy();
    const firstSource = audio.src;

    fireEvent.click(screen.getAllByRole("button", { name: "Próxima faixa" })[0]!);
    await waitFor(() => expect(audio.src).not.toBe(firstSource));
    const secondSource = audio.src;
    fireEvent.click(screen.getAllByRole("button", { name: "Faixa anterior" })[0]!);
    await waitFor(() => expect(audio.src).toBe(firstSource));
    expect(secondSource).not.toBe(firstSource);

    Object.defineProperty(audio, "duration", { configurable: true, value: 200 });
    const progress = screen.getByRole("slider", { name: "Progresso da faixa" });
    fireEvent.change(progress, { target: { value: "25" } });
    expect(audio.currentTime).toBe(50);

    fireEvent.ended(audio);
    await waitFor(() => expect(screen.getAllByText("second").length).toBeGreaterThan(0));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(4);
  });

  it("applies shuffle and repeat through the real player controls", async () => {
    const first = new File(["first"], "first.mp3", { type: "audio/mpeg", lastModified: 21 });
    const second = new File(["second"], "second.mp3", { type: "audio/mpeg", lastModified: 22 });
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector('input[type="file"]')).toBeTruthy());
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [first, second] } });
    const firstRow = (await screen.findAllByText("first")).find((element) => element.closest("button"))?.closest("button");
    fireEvent.click(firstRow!);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    const firstSource = audio.src;
    const shuffle = screen.getByRole("button", { name: "Ativar ordem aleatória" });
    fireEvent.click(shuffle);
    expect(shuffle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Próxima faixa" }));
    await waitFor(() => expect(audio.src).not.toBe(firstSource));
    fireEvent.click(screen.getByRole("button", { name: "Faixa anterior" }));
    await waitFor(() => expect(audio.src).toBe(firstSource));
    fireEvent.click(screen.getByRole("button", { name: "Próxima faixa" }));
    await waitFor(() => expect(audio.src).not.toBe(firstSource));

    const repeat = screen.getByRole("button", { name: "Ativar repetição" });
    fireEvent.click(repeat);
    await waitFor(() => expect(repeat.getAttribute("aria-pressed")).toBe("true"));
    const repeatedSource = audio.src;
    fireEvent.ended(audio);
    await waitFor(() => expect(audio.src).toBe(repeatedSource));
  });

  it("pauses through the player control and revokes object URLs when clearing", async () => {
    const file = new File(["first"], "first.mp3", { type: "audio/mpeg", lastModified: 4 });
    const { container } = render(<Home />);
    await waitFor(() => expect(container.querySelector('input[type="file"]')).toBeTruthy());
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    const firstRow = (await screen.findAllByText("first")).find((element) => element.closest("button"))?.closest("button");
    fireEvent.click(firstRow!);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "paused", { configurable: true, value: false });
    fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "Limpar coleção" })[0]!);
    expect(await screen.findByText("Nenhuma faixa na fila ainda.")).toBeTruthy();
    expect(revokeObjectUrl).toHaveBeenCalled();
  });
});
