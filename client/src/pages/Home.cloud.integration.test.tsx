// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const cloudState = vi.hoisted(() => ({ connected: true }));
const disconnectMutateMock = vi.hoisted(() => vi.fn());
const cloudLibraryData = vi.hoisted(() => ({
  folders: [
    { id: "folder-1", name: "Treinos", trackCount: 2 },
    { id: "folder-2", name: "Shows", trackCount: 1 },
  ],
  files: [
    {
      driveFileId: "drive-file-1",
      name: "Faixa da nuvem",
      mimeType: "audio/mpeg",
      sizeBytes: 1024,
      modifiedTime: null,
      parentDriveFolderId: "folder-1",
      parentDriveFolderName: "Treinos",
      album: "Treinos",
      artist: null,
      coverDriveFileId: null,
    },
    {
      driveFileId: "drive-file-2",
      name: "Outra da pasta",
      mimeType: "audio/mpeg",
      sizeBytes: 1024,
      modifiedTime: null,
      parentDriveFolderId: "folder-1",
      parentDriveFolderName: "Treinos",
      album: "Treinos",
      artist: null,
      coverDriveFileId: null,
    },
    {
      driveFileId: "drive-file-3",
      name: "Faixa de outra pasta",
      mimeType: "audio/mpeg",
      sizeBytes: 1024,
      modifiedTime: null,
      parentDriveFolderId: "folder-2",
      parentDriveFolderName: "Shows",
      album: "Shows",
      artist: null,
      coverDriveFileId: null,
    },
  ],
}));

vi.mock("@/lib/localLibraryStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/localLibraryStore")>();
  return {
    ...actual,
    loadStoredTracks: vi.fn().mockResolvedValue([]),
    saveStoredTracks: vi.fn().mockResolvedValue(undefined),
    clearStoredTracks: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: 12, name: "Conta DriveBeat" },
    isAuthenticated: true,
    error: null,
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    googleDrive: {
      status: {
        useQuery: () => ({
          data: cloudState.connected ? { connected: true, folderCount: 2, trackCount: 3 } : { connected: false, folderCount: 0, trackCount: 0 },
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      library: {
        useQuery: () => {
          const [data] = React.useState(() => ({
            folders: cloudLibraryData.folders.map((folder) => ({ ...folder })),
            files: cloudLibraryData.files.map((file) => ({ ...file })),
          }));
          return { data, isLoading: false };
        },
      },
      sync: { useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }) },
      disconnect: {
        useMutation: (options: { onSuccess?: () => void }) => ({
          mutate: () => {
            disconnectMutateMock();
            cloudState.connected = false;
            options.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

beforeEach(() => {
  cloudState.connected = true;
  disconnectMutateMock.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: vi.fn() });
});

describe("Home Cloud Mode integration", () => {
  it("renders persisted Drive tracks and clears them when disconnecting", async () => {
    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: /Cloud/ }));
    expect((await screen.findAllByText("Faixa da nuvem")).length).toBeGreaterThan(0);
    expect((screen.getAllByText("Treinos")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Desconectar" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    await waitFor(() => expect(disconnectMutateMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryAllByText("Faixa da nuvem")).toHaveLength(0));
    expect(screen.getByRole("button", { name: "Conectar Google Drive" })).toBeTruthy();
  });

  it("initializes the equalizer while playing a Google Drive track", async () => {
    const source = { connect: vi.fn() };
    const context = {
      state: "running",
      destination: {},
      createMediaElementSource: vi.fn(() => source),
      createBiquadFilter: vi.fn(() => ({ type: "", frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect: vi.fn() })),
      close: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(window, "AudioContext", { configurable: true, value: vi.fn(() => context) });

    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: /Cloud/ }));
    fireEvent.click(screen.getByRole("button", { name: /Faixa da nuvem/ }));
    await waitFor(() => expect(context.createMediaElementSource).toHaveBeenCalledTimes(1));
    expect(context.createBiquadFilter).toHaveBeenCalledTimes(8);

    fireEvent.click(screen.getAllByRole("button", { name: "Equalizador gráfico" })[0]!);
    expect(screen.getByRole("dialog", { name: "Equalizador gráfico" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "60 Hz" })).toBeTruthy();
  });

  it("filters a Google Drive track through Favorites", async () => {
    const { container } = render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: /Cloud/ }));
    await waitFor(() => expect(screen.getAllByText("Faixa da nuvem").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Faixa da nuvem/ }));
    fireEvent.click(screen.getByRole("button", { name: "Favoritar" }));
    expect(JSON.parse(localStorage.getItem("drivebeat-favorites") ?? "[]")).toContain("google:drive-file-1");

    fireEvent.click(screen.getByRole("button", { name: /^Favoritos/ }));
    await waitFor(() => {
      const rows = Array.from(container.querySelectorAll(".track-row")).map((row) => row.textContent ?? "");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain("Faixa da nuvem");
    });
  });

  it("restores a Google Drive favorite after remounting", async () => {
    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: /Cloud/ }));
    await waitFor(() => expect(screen.getAllByText("Faixa da nuvem").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /Faixa da nuvem/ }));
    fireEvent.click(screen.getByRole("button", { name: "Favoritar" }));
    expect(JSON.parse(localStorage.getItem("drivebeat-favorites") ?? "[]")).toContain("google:drive-file-1");
    cleanup();
    localStorage.setItem("drivebeat-mode", "local");

    const secondRender = render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: /Cloud/ }));
    await waitFor(() => expect(secondRender.container.querySelectorAll(".track-row")).toHaveLength(3));
    expect(screen.getAllByText("Faixa da nuvem").length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem("drivebeat-favorites") ?? "[]")).toContain("google:drive-file-1");
    fireEvent.click(screen.getByRole("button", { name: /^Favoritos/ }));
    await waitFor(() => {
      const rows = Array.from(secondRender.container.querySelectorAll(".track-row")).map((row) => row.textContent ?? "");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toContain("Faixa da nuvem");
    });
  });

  it("keeps next track inside the selected folder and exposes all songs", async () => {
    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: /Cloud/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Treinos$/ }));

    expect(screen.getAllByText("Faixa da nuvem").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Outra da pasta").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Faixa de outra pasta")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Faixa da nuvem/ }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima faixa" }));
    expect(screen.getAllByText("Outra da pasta").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Faixa de outra pasta")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /^Todas as músicas$/ }));
    expect(screen.getAllByText("Faixa de outra pasta").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Treinos.*Treinos.*2 faixas/ }));
    expect(screen.getAllByText("Faixa da nuvem").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Faixa de outra pasta")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Shows.*Shows.*1 faixa/ }));
    expect(screen.getAllByText("Faixa de outra pasta").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Faixa da nuvem")).toHaveLength(0);
  });
});
