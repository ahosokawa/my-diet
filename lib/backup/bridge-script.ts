// Google Apps Script source for the Drive bridge. The user pastes this into
// script.google.com and deploys it as a web app ("Execute as: Me", "Who has
// access: Anyone"). The app then POSTs files to the /exec URL; the script
// writes them into a `my-diet` folder in the user's Drive, where Claude's
// Drive connector can read them. The shared secret is baked in at copy time.

export const DRIVE_FOLDER = "my-diet";

export function bridgeScript(secret: string): string {
  return `// my-diet → Google Drive bridge. Deploy as a web app:
//   Deploy → New deployment → Web app
//   Execute as: Me · Who has access: Anyone
// To update later, use Manage deployments → Edit so the URL stays the same.

var SECRET = ${JSON.stringify(secret)};
var FOLDER = ${JSON.stringify(DRIVE_FOLDER)};

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: "bad-request" });
  }
  if (!req || req.secret !== SECRET) return reply({ ok: false, error: "auth" });

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var folder = getFolder();
    if (req.action === "write") {
      var names = Object.keys(req.files || {});
      for (var i = 0; i < names.length; i++) {
        writeFile(folder, names[i], req.files[names[i]]);
      }
      return reply({ ok: true, writtenAt: Date.now() });
    }
    if (req.action === "read") {
      var it = folder.getFilesByName(req.name);
      if (!it.hasNext()) return reply({ ok: false, error: "missing" });
      return reply({ ok: true, content: it.next().getBlob().getDataAsString() });
    }
    return reply({ ok: false, error: "bad-request" });
  } finally {
    lock.releaseLock();
  }
}

function getFolder() {
  var it = DriveApp.getFoldersByName(FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);
}

function writeFile(folder, name, content) {
  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    it.next().setContent(content);
  } else {
    folder.createFile(name, content, mimeFor(name));
  }
}

function mimeFor(name) {
  if (/\\.json$/.test(name)) return "application/json";
  if (/\\.csv$/.test(name)) return "text/csv";
  return "text/plain";
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
`;
}

export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Workspace accounts deploy under /a/macros/<domain>/s/…/exec.
const EXEC_URL_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/;

export function isBridgeUrl(url: string): boolean {
  return EXEC_URL_RE.test(url.trim());
}
