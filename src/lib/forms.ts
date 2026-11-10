// Client-side handling for every form marked data-lc-form="contact|newsletter|whitepaper".
// Forms also work without JavaScript: they post to /api/contact.php, which redirects back.

const MESSAGES: Record<string, string> = {
  contact: "Thank you. Your message is with our team and a representative will reach out to you.",
  newsletter: "You're subscribed. Thank you.",
  whitepaper: "Your whitepaper is ready.",
};

export function wireForms(root: ParentNode = document) {
  root.querySelectorAll<HTMLFormElement>("form[data-lc-form]").forEach((form) => {
    if (form.dataset.wired) return;
    form.dataset.wired = "1";
    const ts = form.querySelector<HTMLInputElement>("[data-ts]");
    if (ts) ts.value = String(Date.now());
    const status = form.querySelector<HTMLElement>("[data-status]");
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const kind = form.dataset.lcForm || "contact";

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      if (button) button.disabled = true;
      if (status) {
        status.dataset.state = "";
        status.textContent = "Sending…";
      }
      try {
        const res = await fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        if (status) {
          status.dataset.state = "ok";
          status.textContent = MESSAGES[kind] ?? MESSAGES.contact;
        }
        if (kind === "whitepaper" && data.download) {
          const a = document.createElement("a");
          a.href = data.download;
          a.className = "btn";
          a.textContent = "Download the whitepaper (PDF)";
          a.setAttribute("download", "");
          status?.after(a);
          window.location.href = data.download;
        }
        form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=hidden]), textarea").forEach((i) => {
          if (!i.readOnly) i.value = "";
        });
      } catch (err) {
        if (status) {
          status.dataset.state = "error";
          status.textContent = err instanceof Error ? err.message : String(err);
        }
      } finally {
        if (button) button.disabled = false;
        if (ts) ts.value = String(Date.now() - 4000);
      }
    });
  });
}
