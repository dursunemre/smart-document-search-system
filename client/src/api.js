async function readErrorMessage(res) {
  try {
    const data = await res.json();
    // backend convention: { error: { message, code } }
    if (data && data.error && typeof data.error.message === 'string') return data.error.message;
    // alternative: { message: "..." }
    if (data && typeof data.message === 'string') return data.message;
    return null;
  } catch (_) {
    return null;
  }
}

export async function getJSON(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return await res.json();
}

export async function postFormData(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return await res.json();
}

export async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return await res.json();
}

export async function deleteJSON(url) {
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg || `Request failed (${res.status})`);
  }
  // allow empty response bodies
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

export async function downloadFile(url, filename) {
  const res = await fetch(url);
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}


