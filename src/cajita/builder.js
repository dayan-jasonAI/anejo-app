import { foods, presets, newVariant, totals, clone } from "./catalog.js";
import { normalizeCajitaConfiguration } from "../../functions/_lib/cajita-config.js";
import { loadBrand, paintSurface } from "./artwork.js";
import { createScene } from "./scene.js";

const $ = (id) => document.getElementById(id),
  assets = new Map();
let config = { version: 1, variants: [newVariant()] },
  current = 0,
  scene,
  generatedBusy = false,
  assetBusy = false,
  submitting = false,
  dirty = false;
const active = () => config.variants[current];
const say = (message, id = "status") => {
  $(id).textContent = message;
};
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function option(select, value, text) {
  const op = el("option", text);
  op.value = value;
  select.append(op);
}
function tab(name) {
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.tab === name));
    b.tabIndex = b.dataset.tab === name ? 0 : -1;
  });
  for (const p of ["food", "theme", "details"])
    $("panel-" + p).hidden = p !== name;
  if (name === "details") drawArt();
}
document.querySelectorAll("[data-tab]").forEach((b) => {
  b.onclick = () => tab(b.dataset.tab);
  b.onkeydown = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const list = [...document.querySelectorAll("[data-tab]")],
      i = list.indexOf(b),
      n =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 2
            : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
    tab(list[n].dataset.tab);
    list[n].focus();
  };
});
for (const preset of presets) option($("preset"), preset.id, preset.name);
for (const key of Object.keys(presets[0].colors)) {
  const l = el(
    "label",
    key === "pick" ? "Toothpick" : key.charAt(0).toUpperCase() + key.slice(1),
  );
  const input = el("input");
  input.type = "color";
  input.id = "color-" + key;
  input.oninput = () => {
    active().theme.colors[key] = input.value;
    changed();
  };
  l.append(input);
  $("colors").append(l);
}
for (const f of foods) {
  const row = el("div", null, "food-row");
  row.id = "food-" + f.id;
  const copy = el("div");
  copy.append(el("h3", f.name), el("p", f.detail));
  const counter = el("div", null, "counter");
  const minus = el("button", "−"),
    plus = el("button", "+"),
    num = el("input");
  minus.type = plus.type = "button";
  minus.setAttribute("aria-label", "Remove one " + f.name);
  plus.setAttribute("aria-label", "Add one " + f.name);
  num.id = "count-" + f.id;
  num.type = "number";
  num.min = 0;
  num.max = 50;
  num.step = 1;
  num.setAttribute("aria-label", f.name + " per box");
  function set(n) {
    if (!Number.isInteger(n) || n < 0 || n > 50) {
      num.reportValidity();
      return;
    }
    active().items.find((i) => i.id === f.id).quantity = n;
    num.value = n;
    minus.disabled = n === 0;
    plus.disabled = n === 50;
    changed(true);
  }
  minus.onclick = () => set(Math.max(0, Number(num.value) - 1));
  plus.onclick = () => set(Math.min(50, Number(num.value) + 1));
  num.oninput = () => {
    if (num.value !== "" && num.checkValidity()) set(Number(num.value));
  };
  counter.append(minus, num, plus);
  row.append(copy, counter);
  $("food-list").append(row);
}
function drawVersions() {
  const select = $("variant");
  select.replaceChildren();
  config.variants.forEach((v, i) =>
    option(select, i, `${v.name} · ${v.quantity} boxes`),
  );
  select.value = current;
  $("remove-version").disabled = config.variants.length === 1;
  $("duplicate").disabled = config.variants.length === 20;
}
function drawSummary() {
  const summary = $("summary");
  summary.replaceChildren();
  for (const v of config.variants) {
    const a = el("article");
    a.append(
      el("h3", `${v.quantity} × ${v.name}`),
      el(
        "p",
        v.items
          .filter((i) => i.quantity > 0)
          .map((i) => `${i.quantity} ${foods.find((f) => f.id === i.id).name}`)
          .join(" · ") + " per box",
      ),
      el("p", `${v.theme.name} · ${v.theme.pickShape} toothpick topper`),
    );
    const dessert = v.items.find((i) => i.id === "tres-leches");
    if (!dessert?.quantity)
      a.append(el("p", "NO TRES LECHES — dessert omitted"));
    if (v.notes) a.append(el("p", v.notes));
    if (v.packagingRequest)
      a.append(el("p", "Packaging: " + v.packagingRequest));
    summary.append(a);
  }
  const all = totals(config);
  summary.append(
    el(
      "p",
      `${all.boxes} boxes across ${config.variants.length} version${config.variants.length === 1 ? "" : "s"}`,
      "summary-total",
    ),
    el("p", foods.map((f) => `${all.items[f.id]} ${f.name}`).join(" · ")),
  );
}
function drawScene(animate = false) {
  if (scene) {
    const { total, shown } = scene.update(active(), assets, animate);
    $("scene-count").textContent =
      `${total} items per box · ${active().quantity} boxes${shown < total ? " · first " + shown + " shown" : ""}`;
  }
  $("scene-theme").textContent = active().theme.name;
}
function changed(animate = false) {
  dirty = true;
  drawVersions();
  drawSummary();
  drawScene(animate);
  drawArt();
}
function fill() {
  const v = active();
  drawVersions();
  $("version-name").value = v.name;
  $("quantity").value = v.quantity;
  for (const f of foods) {
    const n = v.items.find((i) => i.id === f.id)?.quantity || 0,
      input = $("count-" + f.id);
    input.value = n;
    input.previousElementSibling.disabled = n === 0;
    input.nextElementSibling.disabled = n === 50;
  }
  $("notes").value = v.notes;
  $("packaging").value = v.packagingRequest;
  $("preset").value = v.theme.preset;
  $("theme-name").value = v.theme.name;
  for (const [key, value] of Object.entries(v.theme.colors))
    $("color-" + key).value = value;
  $("pattern").value = v.theme.pattern;
  $("pick-shape").value = v.theme.pickShape;
  $("theme-prompt").value = v.theme.prompt || "";
  fillSurface();
  drawSummary();
  drawScene();
}
$("variant").onchange = () => {
  current = Number($("variant").value);
  fill();
};
$("duplicate").onclick = () => {
  if (config.variants.length >= 20) return;
  const v = clone(active());
  v.id = crypto.randomUUID();
  v.name = (v.name + " copy").slice(0, 120);
  config.variants.push(v);
  current = config.variants.length - 1;
  dirty = true;
  fill();
  say(
    "Copied all food and design details. Change this version and its box count.",
  );
};
$("remove-version").onclick = () => {
  if (config.variants.length === 1) return;
  if (!confirm(`Remove the version “${active().name}” from this draft?`))
    return;
  config.variants.splice(current, 1);
  current = Math.max(0, current - 1);
  dirty = true;
  fill();
};
$("version-name").oninput = () => {
  active().name = $("version-name").value;
  drawVersions();
  drawSummary();
  dirty = true;
};
$("quantity").oninput = () => {
  if (!$("quantity").value || !$("quantity").checkValidity()) return;
  active().quantity = Number($("quantity").value);
  changed();
};
for (const [id, key] of [
  ["notes", "notes"],
  ["packaging", "packagingRequest"],
])
  $(id).oninput = () => {
    active()[key] = $(id).value;
    dirty = true;
    drawSummary();
  };
$("preset").onchange = () => {
  const p = presets.find((p) => p.id === $("preset").value);
  Object.assign(active().theme, {
    preset: p.id,
    name: p.name,
    colors: { ...p.colors },
    pattern: p.pattern,
    artworkAttachmentId: null,
  });
  dirty = true;
  fill();
};
$("theme-name").oninput = () => {
  active().theme.name = $("theme-name").value;
  changed();
};
$("pattern").onchange = () => {
  active().theme.pattern = $("pattern").value;
  changed();
};
$("pick-shape").onchange = () => {
  active().theme.pickShape = $("pick-shape").value;
  changed();
};
$("theme-prompt").oninput = () => {
  active().theme.prompt = $("theme-prompt").value;
  dirty = true;
};
$("lid").onclick = () => {
  if (scene) {
    $("lid").textContent = scene.toggle() ? "Show open box" : "Show closed box";
    drawScene();
  }
};
$("reset-view").onclick = () => scene?.reset();
$("replay").onclick = () => drawScene(true);

function selectedLayer() {
  const s = $("surface").value;
  if ($("layer").value === "text")
    return active().personalization.textPlacements.find((p) => p.surface === s);
  return active().personalization.artworks.find(
    (a) => a.surface === s && a.attachmentId === $("layer").value,
  );
}
function fillLayer() {
  const layer = selectedLayer();
  if (!layer) return;
  const text = $("layer").value === "text";
  $("pos-x").value = text ? layer.x * 100 : layer.x / 100;
  $("pos-y").value = text ? layer.y * 100 : layer.y / 100;
  $("scale").value = layer.scale * 100;
  $("rotation").value = layer.rotation;
  $("remove-art").disabled = text;
}
function fillSurface() {
  const surface = $("surface").value;
  $("surface-text").value = active().personalization[surface + "Text"] || "";
  $("layer").replaceChildren();
  option($("layer"), "text", "Personal message");
  for (const a of active().personalization.artworks.filter(
    (a) => a.surface === surface,
  ))
    option(
      $("layer"),
      a.attachmentId,
      assets.get(a.attachmentId)?.name || "Artwork",
    );
  fillLayer();
  drawArt();
  drawFiles();
}
function drawArt() {
  paintSurface($("artboard"), active(), $("surface").value, assets);
}
$("surface").onchange = fillSurface;
$("layer").onchange = fillLayer;
$("surface-text").oninput = () => {
  active().personalization[$("surface").value + "Text"] =
    $("surface-text").value;
  changed();
};
for (const id of ["pos-x", "pos-y", "scale", "rotation"])
  $(id).oninput = () => {
    const layer = selectedLayer();
    if (!layer) return;
    const text = $("layer").value === "text";
    layer.x = text
      ? Number($("pos-x").value) / 100
      : Number($("pos-x").value) * 100;
    layer.y = text
      ? Number($("pos-y").value) / 100
      : Number($("pos-y").value) * 100;
    layer.scale = Number($("scale").value) / 100;
    layer.rotation = Number($("rotation").value);
    changed();
  };
let dragging = false;
$("artboard").onpointerdown = (e) => {
  dragging = true;
  $("artboard").setPointerCapture(e.pointerId);
};
$("artboard").onpointerup = () => {
  dragging = false;
};
$("artboard").onpointercancel = () => {
  dragging = false;
};
$("artboard").onpointermove = (e) => {
  if (!dragging) return;
  const r = $("artboard").getBoundingClientRect();
  $("pos-x").value = Math.round(
    Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
  );
  $("pos-y").value = Math.round(
    Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
  );
  $("pos-x").oninput();
};
$("remove-art").onclick = () => {
  const id = $("layer").value;
  active().personalization.artworks = active().personalization.artworks.filter(
    (a) => !(a.surface === $("surface").value && a.attachmentId === id),
  );
  fillSurface();
  changed();
};
const toDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read that file."));
    r.readAsDataURL(blob);
  });
async function addAsset(blob, name, id = crypto.randomUUID()) {
  if (assets.size >= 5)
    throw new Error(
      "The request already has five files. Remove an unused file before adding another.",
    );
  if (blob.size > 10 * 1024 * 1024)
    throw new Error("Each file must be 10MB or smaller.");
  if (!["image/jpeg", "image/png", "application/pdf"].includes(blob.type))
    throw new Error("Use a JPG, PNG, or PDF file.");
  let image = null;
  if (blob.type.startsWith("image/")) {
    image = new Image();
    image.src = await toDataURL(blob);
    await image.decode();
  }
  assets.set(id, { blob, name, image });
  return id;
}
function drawFiles() {
  const list = $("files");
  list.replaceChildren();
  for (const [id, a] of assets) {
    const li = el(
      "li",
      a.name + " · " + (a.image ? "Artwork" : "PDF instructions") + " ",
    );
    const attach = el("button", "Place on " + $("surface").value);
    attach.type = "button";
    attach.disabled = !a.image;
    attach.onclick = () => {
      const surface = $("surface").value;
      if (
        !active().personalization.artworks.some(
          (x) => x.surface === surface && x.attachmentId === id,
        )
      )
        active().personalization.artworks.push({
          attachmentId: id,
          surface,
          x: 5000,
          y: 7600,
          scale: 0.6,
          rotation: 0,
        });
      fillSurface();
      $("layer").value = id;
      fillLayer();
      changed();
    };
    const remove = el("button", "Remove file");
    remove.type = "button";
    remove.onclick = () => {
      if (!confirm("Remove this file and every use of it from all versions?"))
        return;
      for (const v of config.variants) {
        v.personalization.artworks = v.personalization.artworks.filter(
          (a) => a.attachmentId !== id,
        );
        if (v.theme.artworkAttachmentId === id)
          v.theme.artworkAttachmentId = null;
      }
      assets.delete(id);
      fillSurface();
      changed();
    };
    li.append(attach, remove);
    list.append(li);
  }
}
$("art-files").onchange = async () => {
  assetBusy = true;
  const targetVariant = active(),
    targetSurface = $("surface").value;
  try {
    for (const f of $("art-files").files) {
      const id = await addAsset(f, f.name);
      if (f.type.startsWith("image/"))
        targetVariant.personalization.artworks.push({
          attachmentId: id,
          surface: targetSurface,
          x: 5000,
          y: 7600,
          scale: 0.6,
          rotation: 0,
        });
    }
    fillSurface();
    changed();
    say(
      "Design files added to this draft. They upload securely when you submit.",
    );
  } catch (e) {
    say(e.message);
  } finally {
    assetBusy = false;
    $("art-files").value = "";
    drawFiles();
  }
};
$("generate").onclick = async () => {
  if (generatedBusy) return;
  if (assets.size >= 5) {
    say("Remove an unused file before generating another theme.", "ai-status");
    return;
  }
  const v = active(),
    prompt = $("theme-prompt").value.trim();
  if (!prompt) {
    say("Describe your theme first.", "ai-status");
    return;
  }
  generatedBusy = true;
  $("generate").disabled = true;
  say(
    "Creating your decorative theme. This can take a couple of minutes. Your brand stays unchanged.",
    "ai-status",
  );
  try {
    const res = await fetch("/api/cajita-theme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const out = await res.json();
    if (!res.ok || !out.image)
      throw new Error(out.error || "Theme preview is unavailable.");
    const blob = await (await fetch(out.image)).blob();
    v.theme.artworkAttachmentId = await addAsset(
      blob,
      "AI theme " + new Date().toISOString().slice(0, 10) + ".png",
    );
    v.theme.prompt = prompt;
    changed();
    drawFiles();
    say(
      "Generated concept applied to the liner, label and tag. Añejo reviews the final design.",
      "ai-status",
    );
  } catch (e) {
    say(e.message + " Your manual theme and draft are unchanged.", "ai-status");
  } finally {
    generatedBusy = false;
    $("generate").disabled = false;
  }
};
$("clear-ai").onclick = () => {
  active().theme.artworkAttachmentId = null;
  changed();
  say(
    "Generated pattern removed from this version. File remains available in Details.",
    "ai-status",
  );
};

function check() {
  if (assetBusy || generatedBusy)
    return {
      ok: false,
      error:
        "Please let the artwork or theme finish loading before saving or submitting.",
    };
  for (const input of document.querySelectorAll(
    "#controls input[type=number]",
  )) {
    if (input.value === "" || !input.checkValidity()) {
      input.reportValidity();
      return {
        ok: false,
        error: "Please correct the box and food quantities before continuing.",
      };
    }
  }
  return normalizeCajitaConfiguration(config, {
    attachmentIds: new Set(assets.keys()),
  });
}
function download() {
  const checked = check();
  if (!checked.ok) {
    say(checked.error);
    return;
  }
  const blob = new Blob(
      [
        JSON.stringify(
          {
            configuration: checked.value,
            summary: checked.summary,
            files: [...assets].map(([id, a]) => ({ id, name: a.name })),
            notice:
              "Design request only; not an approved production proof. Files must be attached separately.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
    url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = "anejo-cajita-design.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("download").onclick = download;
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("anejo-cajita-draft", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("draft");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
$("save-draft").onclick = async () => {
  const checked = check();
  if (!checked.ok) {
    say(checked.error);
    return;
  }
  try {
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("draft", "readwrite");
      tx.objectStore("draft").put(
        {
          config: checked.value,
          assets: [...assets].map(([id, a]) => ({
            id,
            blob: a.blob,
            name: a.name,
          })),
        },
        "current",
      );
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    d.close();
    dirty = false;
    say(
      "Saved on this device, including artwork. Contact details are not saved. This is not a submitted request.",
    );
  } catch {
    say(
      "This browser could not save the draft. Download your design details and keep your original artwork files.",
    );
  }
};
window.addEventListener("beforeunload", (e) => {
  if (dirty && !submitting) {
    e.preventDefault();
    e.returnValue = "";
  }
});

$("quote-form").onsubmit = async (e) => {
  e.preventDefault();
  if (submitting) return;
  const form = $("quote-form"),
    checked = check();
  if (!checked.ok) {
    say(checked.error, "quote-status");
    return;
  }
  if (!form.reportValidity()) return;
  const eventFields = Object.fromEntries(new FormData(form));
  const smsConsent = form.elements.sms_consent.checked;
  const locked = [
    ...document.querySelectorAll(
      "#controls input,#controls select,#controls textarea,#controls button,#quote-form input,#quote-form textarea,#quote-form button",
    ),
  ].map((node) => ({ node, disabled: node.disabled }));
  locked.forEach(({ node }) => {
    node.disabled = true;
  });
  submitting = true;
  $("submit").disabled = true;
  say("Saving your exact design request…", "quote-status");
  try {
    const sent = clone(checked.value);
    let sessionId = "";
    const idMap = new Map();
    if (assets.size) {
      const start = await fetch("/api/catering-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create" }),
      });
      const session = await start.json();
      if (!start.ok)
        throw new Error(session.error || "Cannot start secure uploads.");
      sessionId = session.session_id;
      let n = 0;
      for (const [local, a] of assets) {
        say(`Uploading design file ${++n} of ${assets.size}…`, "quote-status");
        const response = await fetch("/api/catering-uploads", {
          method: "POST",
          headers: {
            "Content-Type": a.blob.type,
            "X-Upload-Session": sessionId,
            "X-File-Name": encodeURIComponent(a.name),
          },
          body: a.blob,
        });
        const result = await response.json();
        if (!response.ok || !result.attachment_id)
          throw new Error(result.error || "Design upload failed.");
        idMap.set(local, result.attachment_id);
      }
    }
    for (const v of sent.variants) {
      if (v.theme.artworkAttachmentId)
        v.theme.artworkAttachmentId = idMap.get(v.theme.artworkAttachmentId);
      for (const a of v.personalization.artworks)
        a.attachmentId = idMap.get(a.attachmentId);
    }
    const data = eventFields;
    Object.assign(data, {
      kind: "catering",
      lang: "en",
      guests: Number(data.guests),
      menu_options: ["Individual Cajitas"],
      sms_consent: smsConsent,
      cajita_configuration: sent,
      upload_session_id: sessionId,
      event_theme: "Multiple Cajita versions — see exact configuration",
      design_notes:
        "Cajita Atelier request. Exact versioned configuration and artwork placements attached to this record.",
    });
    say("Submitting the event and all Cajita versions…", "quote-status");
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const out = await response.json();
    if (!response.ok || !out.ok || !out.id)
      throw new Error(out.error || "We could not confirm receipt.");
    dirty = false;
    const received = el("div");
    received.append(
      el("h3", "Request received."),
      el("p", `Reference: ${out.id}`),
      el(
        "p",
        `${totals(sent).boxes} boxes across ${sent.variants.length} version(s). The Añejo team will review your details and follow up with a custom quote.`,
      ),
    );
    if (out.attachments?.linked === false)
      received.append(
        el(
          "p",
          "Your request is saved, but an attachment link needs team attention. Keep your original files and this reference.",
        ),
      );
    if (!out.notifications?.email || !out.notifications?.hub)
      received.append(
        el(
          "p",
          "Your request is recorded. A notification needs attention; please keep your reference.",
        ),
      );
    form.replaceChildren(received);
    received.tabIndex = -1;
    received.focus();
  } catch (error) {
    say(
      `${error.message} Your design is still here. If the connection failed after sending, receipt is uncertain; contact Añejo before resubmitting to avoid a duplicate. No email app was opened and no files were discarded.`,
      "quote-status",
    );
    $("submit").disabled = false;
  } finally {
    locked.forEach(({ node, disabled }) => {
      node.disabled = disabled;
    });
    submitting = false;
  }
};

async function init() {
  try {
    await loadBrand();
  } catch {
    say(
      "The original brand artwork could not load. Please reload before requesting a quote.",
    );
    $("submit").disabled = true;
  }
  try {
    const d = await db();
    const saved = await new Promise((resolve, reject) => {
      const r = d.transaction("draft").objectStore("draft").get("current");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    d.close();
    if (saved) {
      const ids = new Set(saved.assets.map((a) => a.id));
      const checked = normalizeCajitaConfiguration(saved.config, {
        attachmentIds: ids,
      });
      if (checked.ok) {
        config = checked.value;
        for (const a of saved.assets) await addAsset(a.blob, a.name, a.id);
        say(
          "Your saved design was restored from this device. It has not been submitted.",
        );
      }
    }
  } catch {
    say(
      "Saved draft could not be restored. The new design controls are available.",
    );
  }
  try {
    scene = createScene($("scene"), (id) => {
      tab("food");
      $("count-" + id).focus();
      $("food-" + id).scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  } catch {
    $("scene-fallback").hidden = false;
    for (const id of ["lid", "reset-view", "replay"]) $(id).disabled = true;
  }
  fill();
  try {
    const res = await fetch("/api/cajita-theme");
    const out = await res.json();
    if (!out.capability?.available) {
      $("generate").disabled = true;
      say(
        "AI previews are not available yet. You can fully customize colors, patterns, text and uploaded artwork, and include your theme description for Añejo.",
        "ai-status",
      );
    }
  } catch {
    $("generate").disabled = true;
    say(
      "AI preview availability could not be checked. Manual customization remains available.",
      "ai-status",
    );
  }
}
init();
