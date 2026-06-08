export function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () =>
    Array.from(
      { length: 3 },
      () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join('');
  return [part(), part(), part()].join('-');
}

export function generateUserId() {
  return `user-${Math.random().toString(36).slice(2, 10)}`;
}
