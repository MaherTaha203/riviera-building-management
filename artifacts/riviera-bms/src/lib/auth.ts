import { User } from "@workspace/api-client-react";

export function getToken(): string | null {
  return localStorage.getItem("riviera_token");
}

export function setToken(token: string): void {
  localStorage.setItem("riviera_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("riviera_token");
  localStorage.removeItem("riviera_user");
}

export function getUser(): User | null {
  const userStr = localStorage.getItem("riviera_user");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as User;
  } catch (e) {
    return null;
  }
}

export function setUser(user: User): void {
  localStorage.setItem("riviera_user", JSON.stringify(user));
}
