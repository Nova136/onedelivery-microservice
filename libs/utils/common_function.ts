export default function isNullOrEmpty(str) {
  return (!str || str.length === 0);
}

export function IsStringNullOrEmptyAfterTrim(str) {
  let trimmedText = str.trim();
  if (isNullOrEmpty(str)) {
    return true;
  }
  if (isNullOrEmpty(trimmedText)) {
    return true
  }
  else {
    return false;
  }
}
