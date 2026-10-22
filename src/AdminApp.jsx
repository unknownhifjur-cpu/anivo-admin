import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Film,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? "" : "https://anivo-server.onrender.com")
).replace(/\/$/, "");

const emptyForm = {
  title: "",
  description: "",
  videoUrl: "",
  genreInput: "",
  episodes: "0",
  status: "upcoming",
};

async function responseError(response, fallback) {
  const body = await response.text().catch(() => "");
  let result = {};
  try {
    result = body ? JSON.parse(body) : {};
  } catch {
    result = {};
  }
  const message = typeof result.error === "string"
    ? result.error
    : result.error?.message || result.message;
  if (message) {
    if (/forbidden.*actions=.*create/i.test(message)) {
      return `Cloudinary denied permission to create this upload (HTTP ${response.status}). Confirm the upload preset is unsigned and enabled for image uploads.`;
    }
    return `${message} (HTTP ${response.status})`;
  }
  if (response.status === 403) {
    return `Cloudinary rejected the signed upload without a readable error message (HTTP ${response.status}). Check Cloudinary upload restrictions and confirm the configured credentials belong to this cloud.`;
  }
  return `${fallback} (HTTP ${response.status})`;
}

export default function AdminApp() {
  const [admin, setAdmin] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [adminConfigurationMissing, setAdminConfigurationMissing] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [coverFile, setCoverFile] = useState(null);
  const [coverImage, setCoverImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/anime/manage`, { credentials: "include" });
      if (!response.ok) throw new Error(await responseError(response, "Could not load the catalog."));
      const result = await response.json();
      setCatalog(result.anime);
    } catch (error) {
      setCatalogError(error.message || "Could not load the catalog.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, "Could not check your session."));
        return response.json();
      })
      .then((result) => {
        if (!active) return;
        if (result.adminConfigured === false) {
          setAdminConfigurationMissing(true);
        } else if (result.user?.role === "admin") {
          setAdmin(result.user);
          setCatalogLoading(true);
          fetch(`${API_BASE_URL}/api/anime/manage`, { credentials: "include" })
            .then(async (response) => {
              if (!response.ok) throw new Error(await responseError(response, "Could not load the catalog."));
              return response.json();
            })
            .then((catalogResult) => {
              if (active) setCatalog(catalogResult.anime);
            })
            .catch((error) => {
              if (active) setCatalogError(error.message || "Could not load the catalog.");
            })
            .finally(() => {
              if (active) setCatalogLoading(false);
            });
        } else if (result.user) {
          setAuthError("This portal only accepts the administrator account. Sign in with the admin email.");
        }
      })
      .catch((error) => {
        if (active) setAuthError(error.message || "Could not check your session.");
      })
      .finally(() => {
        if (active) setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleCatalog = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return catalog;
    return catalog.filter((item) =>
      item.title.toLowerCase().includes(term) ||
      item.genres?.some((genre) => genre.toLowerCase().includes(term))
    );
  }, [catalog, search]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError("");
    setNotice("");
  };

  const resetForm = () => {
    setEditingId("");
    setForm(emptyForm);
    setCoverFile(null);
    setCoverImage("");
    setFormError("");
    setNotice("");
  };

  const openEdit = (item) => {
    setEditingId(item._id);
    setForm({
      title: item.title,
      description: item.description || "",
      videoUrl: item.videoUrl || "",
      genreInput: item.genres?.join(", ") || "",
      episodes: String(item.episodes ?? 0),
      status: item.status || "upcoming",
    });
    setCoverFile(null);
    setCoverImage(item.coverImage || "");
    setFormError("");
    setNotice("");
    document.getElementById("admin-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthPending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not sign in."));
      const result = await response.json();
      if (result.user?.role !== "admin") {
        const logoutResponse = await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
        if (!logoutResponse.ok) {
          throw new Error(await responseError(logoutResponse, "This portal only accepts the administrator account."));
        }
        throw new Error("This portal only accepts the administrator account.");
      }
      setAdmin(result.user);
      setPassword("");
      await loadCatalog();
    } catch (error) {
      setAuthError(
        error instanceof TypeError
          ? "Could not reach the API server. Make sure it is running, then try again."
          : error.message || "Could not sign in."
      );
    } finally {
      setAuthPending(false);
    }
  };

  const signOut = async () => {
    setAuthPending(true);
    setAuthError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not sign out."));
      setAdmin(null);
      resetForm();
    } catch (error) {
      setAuthError(error.message || "Could not sign out.");
    } finally {
      setAuthPending(false);
    }
  };

  const uploadCover = async () => {
    setFormError("");
    setNotice("");
    if (!coverFile) {
      setFormError("Choose a cover image first.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(coverFile.type)) {
      setFormError("Choose a JPG, PNG, WebP, or AVIF image.");
      return;
    }
    if (coverFile.size > 8 * 1024 * 1024) {
      setFormError("Cover images must be 8 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const configResponse = await fetch(`${API_BASE_URL}/api/uploads/config`, {
        credentials: "include",
      });
      if (!configResponse.ok) {
        throw new Error(await responseError(configResponse, "Could not load Cloudinary upload settings."));
      }
      const uploadConfig = await configResponse.json();
      const data = new FormData();
      data.append("file", coverFile);
      data.append("upload_preset", uploadConfig.uploadPreset);

      const uploadResponse = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(uploadConfig.cloudName)}/image/upload`,
        { method: "POST", body: data }
      );
      if (!uploadResponse.ok) {
        throw new Error(await responseError(uploadResponse, "Cloudinary could not upload this image."));
      }
      const result = await uploadResponse.json();
      if (!result.secure_url) throw new Error("Cloudinary did not return a secure image URL.");
      setCoverImage(result.secure_url);
      setNotice("Cover uploaded successfully.");
    } catch (error) {
      setFormError(
        error instanceof TypeError
          ? "The cover upload could not connect. Check your internet connection and try again."
          : error.message || "The cover upload failed."
      );
    } finally {
      setUploading(false);
    }
  };

  const saveAnime = async (event) => {
    event.preventDefault();
    setFormError("");
    setNotice("");
    if (!coverImage) {
      setFormError("Upload a cover image before saving this title.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        genres: form.genreInput.split(",").map((genre) => genre.trim()).filter(Boolean),
        coverImage,
        videoUrl: form.videoUrl,
        episodes: Number(form.episodes),
        status: form.status,
      };
      const response = await fetch(
        editingId ? `${API_BASE_URL}/api/anime/${encodeURIComponent(editingId)}` : `${API_BASE_URL}/api/anime`,
        {
          method: editingId ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) throw new Error(await responseError(response, "Could not save this title."));
      const result = await response.json();
      setCatalog((current) =>
        editingId
          ? current.map((item) => item._id === editingId ? result.anime : item)
          : [result.anime, ...current]
      );
      const successMessage = editingId ? "Title updated." : "Title added to the catalog.";
      resetForm();
      setNotice(successMessage);
    } catch (error) {
      setFormError(error.message || "Could not save this title.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAnime = async (item) => {
    if (!window.confirm(`Delete "${item.title}" from the catalog? This cannot be undone.`)) return;
    setDeletingId(item._id);
    setCatalogError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/anime/${encodeURIComponent(item._id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not delete this title."));
      setCatalog((current) => current.filter((entry) => entry._id !== item._id));
      if (editingId === item._id) resetForm();
    } catch (error) {
      setCatalogError(error.message || "Could not delete this title.");
    } finally {
      setDeletingId("");
    }
  };

  if (!authChecked) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-4 text-white">
        <div className="flex items-center gap-3 text-sm text-muted">
          <LoaderCircle className="animate-spin text-lilac" size={18} />
          Checking administrator session...
        </div>
      </main>
    );
  }

  if (adminConfigurationMissing) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas px-4 text-white">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12101a] p-6 text-center shadow-2xl sm:p-8">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-300/10 text-amber-200">
            <ShieldCheck size={23} />
          </div>
          <h1 className="mt-4 font-display text-xl font-extrabold">Restart the API server</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The API currently running has not loaded the administrator settings from
            <code className="mx-1 rounded bg-white/[.06] px-1.5 py-0.5 text-xs text-[#d8cde5]">server/.env</code>.
            Stop and restart the server, then reload this page before signing in.
          </p>
          <button
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-lilac px-4 text-xs font-bold text-[#170e20] transition hover:bg-[#bd8bff]"
            onClick={() => window.location.reload()}
            type="button"
          >
            Check again
          </button>
        </section>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4 py-10 text-white">
        <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-lilac/10 blur-3xl" />
        <section className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#12101a] p-6 shadow-2xl sm:p-8">
          <a className="mb-8 inline-flex items-center gap-2 text-xs text-muted transition hover:text-white" href="/">
            <ArrowLeft size={14} /> Back to AnivoAnime
          </a>
          <div className="mb-5 grid size-12 place-items-center rounded-xl bg-lilac/10 text-lilac">
            <ShieldCheck size={23} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-lilac">Private workspace</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold">Administrator sign in</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Sign in with the configured administrator account to manage the anime catalog.
          </p>
          <form className="mt-6 space-y-4" onSubmit={submitLogin}>
            <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
              Admin email
              <input
                autoComplete="username"
                autoFocus
                className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-lilac"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
              Password
              <input
                autoComplete="current-password"
                className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-lilac"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {authError && (
              <p className="rounded-md border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-xs text-rose-200" role="alert">
                {authError}
              </p>
            )}
            <button
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-lilac text-sm font-bold text-[#170e20] transition hover:bg-[#bd8bff] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={authPending}
              type="submit"
            >
              {authPending && <LoaderCircle className="animate-spin" size={16} />}
              {authPending ? "Signing in..." : "Sign in to admin"}
            </button>
          </form>
          <p className="mt-5 text-center text-[10px] text-muted">
            Admin access only. Standard user accounts cannot enter this workspace.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas text-white">
      <header className="sticky top-0 z-20 border-b border-white/[.07] bg-[#090811]/95 px-4 backdrop-blur-xl sm:px-7">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/" aria-label="Back to AnivoAnime" className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-muted hover:text-white">
              <ArrowLeft size={16} />
            </a>
            <img className="hidden h-8 w-10 object-contain sm:block" src={`${import.meta.env.BASE_URL}anivoanime-logo.png`} alt="" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-sm font-extrabold sm:text-base">AnivoAnime Studio</h1>
              <p className="truncate text-[10px] text-muted">{admin.email}</p>
            </div>
          </div>
          <button
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-white/10 px-3 text-xs text-[#c9c3d1] transition hover:border-rose-300/30 hover:text-rose-200 disabled:opacity-50"
            disabled={authPending}
            onClick={signOut}
            type="button"
          >
            <LogOut size={14} /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-10">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.22em] text-lilac">Admin workspace</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold">Catalog management</h2>
            <p className="mt-2 text-sm text-muted">Upload covers, manage titles, and maintain video links.</p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[.03] px-4 py-2.5">
              <p className="text-[10px] text-muted">Catalog titles</p>
              <p className="mt-0.5 text-lg font-bold">{catalog.length}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[.03] px-4 py-2.5">
              <p className="text-[10px] text-muted">With video</p>
              <p className="mt-0.5 text-lg font-bold">{catalog.filter((item) => item.videoUrl).length}</p>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="min-w-0 rounded-xl border border-white/10 bg-[#12101a]">
            <div className="flex flex-col gap-3 border-b border-white/[.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h3 className="font-display text-base font-bold">Your catalog</h3>
                <p className="mt-1 text-[10px] text-muted">Edit title details or remove an entry.</p>
              </div>
              <label className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 text-muted sm:w-60">
                <Search size={14} />
                <input
                  aria-label="Search catalog"
                  className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-muted"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search titles or genres"
                  value={search}
                />
              </label>
            </div>
            {catalogError && (
              <p className="mx-4 mt-4 rounded-md border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-xs text-rose-200 sm:mx-5" role="alert">
                {catalogError}
              </p>
            )}
            {catalogLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-16 text-xs text-muted">
                <LoaderCircle className="animate-spin text-lilac" size={15} /> Loading catalog...
              </div>
            ) : visibleCatalog.length ? (
              <div className="divide-y divide-white/[.06]">
                {visibleCatalog.map((item) => (
                  <article className="flex gap-3 p-4 sm:gap-4 sm:p-5" key={item._id}>
                    <img
                      alt=""
                      className="aspect-[.78] w-14 shrink-0 rounded-md bg-black/30 object-cover sm:w-16"
                      src={item.coverImage}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-sm font-semibold">{item.title}</h4>
                        <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[9px] capitalize text-[#c9c3d1]">
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted">
                        {item.genres?.join(" · ") || "No genres"}{item.episodes ? ` · ${item.episodes} episodes` : ""}
                      </p>
                      <p className="mt-2 truncate text-[10px] text-muted">
                        {item.videoUrl ? "Video link added" : "No video link"}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[10px] text-[#c9c3d1] hover:border-lilac/40 hover:text-white"
                          onClick={() => openEdit(item)}
                          type="button"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-rose-300/15 px-2.5 text-[10px] text-rose-200 hover:bg-rose-300/10 disabled:opacity-50"
                          disabled={deletingId === item._id}
                          onClick={() => deleteAnime(item)}
                          type="button"
                        >
                          {deletingId === item._id
                            ? <LoaderCircle className="animate-spin" size={12} />
                            : <Trash2 size={12} />}
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-5 py-14 text-center">
                <Film className="mx-auto text-muted" size={24} />
                <p className="mt-3 text-sm font-semibold">{search ? "No matching titles" : "Your catalog is empty"}</p>
                <p className="mt-1 text-xs text-muted">Add a title using the editor.</p>
              </div>
            )}
          </section>

          <section className="scroll-mt-24 rounded-xl border border-white/10 bg-[#12101a] p-4 sm:p-5" id="admin-editor">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-lilac">
                  {editingId ? "Edit catalog entry" : "New catalog entry"}
                </p>
                <h3 className="mt-1 font-display text-lg font-bold">
                  {editingId ? "Update anime" : "Add anime"}
                </h3>
              </div>
              {editingId ? (
                <button
                  aria-label="Cancel editing"
                  className="grid size-8 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-white"
                  onClick={resetForm}
                  type="button"
                >
                  <X size={15} />
                </button>
              ) : (
                <span className="grid size-8 place-items-center rounded-md bg-lilac/10 text-lilac">
                  <Plus size={16} />
                </span>
              )}
            </div>

            <form className="space-y-4" onSubmit={saveAnime}>
              <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
                Cover artwork
                <input
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="block w-full cursor-pointer rounded-md border border-white/10 bg-black/20 text-[10px] text-muted file:mr-3 file:border-0 file:bg-white/10 file:px-3 file:py-2.5 file:text-[10px] file:text-white"
                  onChange={(event) => {
                    setCoverFile(event.target.files?.[0] ?? null);
                    setCoverImage("");
                    setFormError("");
                  }}
                  type="file"
                />
                <span className="block text-[10px] text-muted">JPG, PNG, WebP, or AVIF · up to 8 MB</span>
              </label>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-lilac/40 px-3 text-xs text-lilac transition hover:bg-lilac/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={uploading || !coverFile}
                onClick={uploadCover}
                type="button"
              >
                {uploading ? <LoaderCircle className="animate-spin" size={14} /> : <Upload size={14} />}
                {uploading ? "Uploading..." : "Upload cover"}
              </button>
              {coverImage && (
                <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/20 p-2">
                  <img className="size-12 rounded object-cover" src={coverImage} alt="Cover preview" />
                  <span className="text-[10px] text-emerald-300">
                    {notice || (coverFile ? "New cover ready" : "Current cover")}
                  </span>
                </div>
              )}

              <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
                Title
                <input
                  className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-lilac"
                  maxLength={120}
                  onChange={(event) => updateForm("title", event.target.value)}
                  required
                  value={form.title}
                />
              </label>
              <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
                Description
                <textarea
                  className="min-h-20 w-full resize-y rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-lilac"
                  maxLength={1000}
                  onChange={(event) => updateForm("description", event.target.value)}
                  value={form.description}
                />
              </label>
              <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
                Video URL
                <input
                  className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-lilac"
                  maxLength={2000}
                  onChange={(event) => updateForm("videoUrl", event.target.value)}
                  placeholder="YouTube, Vimeo, or direct HTTPS video"
                  type="url"
                  value={form.videoUrl}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
                  Genres
                  <input
                    className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-lilac"
                    onChange={(event) => updateForm("genreInput", event.target.value)}
                    placeholder="Action, Fantasy"
                    value={form.genreInput}
                  />
                </label>
                <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
                  Episodes
                  <input
                    className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-lilac"
                    min="0"
                    onChange={(event) => updateForm("episodes", event.target.value)}
                    type="number"
                    value={form.episodes}
                  />
                </label>
              </div>
              <label className="block space-y-1.5 text-xs text-[#c9c3d1]">
                Release status
                <select
                  className="w-full rounded-md border border-white/10 bg-[#17151f] px-3 py-2.5 text-sm text-white outline-none focus:border-lilac"
                  onChange={(event) => updateForm("status", event.target.value)}
                  value={form.status}
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              {formError && (
                <p className="rounded-md border border-rose-300/20 bg-rose-300/5 px-3 py-2 text-xs text-rose-200" role="alert">
                  {formError}
                </p>
              )}
              {notice && <p className="text-xs text-emerald-300" role="status">{notice}</p>}
              <button
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-lilac text-xs font-bold text-[#170e20] transition hover:bg-[#bd8bff] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={saving || uploading || !coverImage}
                type="submit"
              >
                {(saving || uploading) && <LoaderCircle className="animate-spin" size={14} />}
                {saving ? "Saving..." : editingId ? "Save changes" : "Add to catalog"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
