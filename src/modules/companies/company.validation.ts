import { AppError } from "../../shared/app-error.js";
import type { CreateCompanyInput } from "./company.types.js";

export function validateCompanyInput(body: unknown): CreateCompanyInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError(400, "Send company details as a JSON object.");
  }

  const input = body as Record<string, unknown>;
  const errors: Record<string, string> = Object.create(null);
  const allowed = new Set(["name", "address", "phone"]);

  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) errors[field] = "This field is not supported.";
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    errors.name = "Company name is required and must be text.";
  } else if (name.includes("\u0000")) {
    errors.name = "Company name contains an unsupported character.";
  } else if ([...name].length > 150) {
    errors.name = "Company name must be 150 characters or fewer.";
  }

  function optionalText(field: "address" | "phone", max: number): string | null {
    const value = input[field];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      errors[field] = `${field === "phone" ? "Phone" : "Address"} must be text.`;
      return null;
    }

    const text = value.trim();
    if (text.includes("\u0000")) {
      errors[field] = `${field === "phone" ? "Phone" : "Address"} contains an unsupported character.`;
    } else if ([...text].length > max) {
      errors[field] = `${field === "phone" ? "Phone" : "Address"} must be ${max} characters or fewer.`;
    }
    return text || null;
  }

  const address = optionalText("address", 500);
  const phone = optionalText("phone", 32);

  if (Object.keys(errors).length > 0) {
    throw new AppError(400, "Please check the company details.", errors);
  }

  return { name, address, phone };
}

export function validateCompanyId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, "Company ID must be a valid UUID.");
  }
  return value;
}
