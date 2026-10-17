// Only explicit, same-origin destinations. Secrets stay in fragments, never
// query strings, preview metadata, or requests made by messaging crawlers.
const fragment = location.hash.slice(1);
if (/^lobby\/[A-Za-z0-9]{6}$/.test(fragment)) {
  location.replace('/#' + fragment);
} else if (/^private\/[A-Za-z0-9]{6}\.[A-Za-z0-9_-]{43}$/.test(fragment)) {
  location.replace('/join#' + fragment.slice('private/'.length));
} else {
  location.replace('/');
}
