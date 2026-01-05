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


