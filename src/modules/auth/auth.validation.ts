import { z } from "zod";

/**
 * Every message here is shown to the user as-is, so they read as guidance
 * rather than as a parser complaint. Zod never echoes the submitted value back,
 * which keeps passwords out of responses and client-side logs.
 */

const email = z
  .string({ required_error: "Please enter your email address." })
  .trim()
  .min(1, "Please enter your email address.")
  .max(255, "That email address is too long.")
  .email("That doesn't look like a valid email address.")
  .transform((value) => value.toLowerCase());

const code = z
  .string({ required_error: "Please enter the 6-digit code we emailed you." })
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your email.");

const password = z
  .string({ required_error: "Please choose a password." })
  .min(10, "Use at least 10 characters — longer passwords are much harder to guess.")
  // bcrypt silently ignores anything past 72 bytes, so reject it rather than
  // letting someone believe a 100-character password is fully protecting them.
  .max(72, "Passwords can be at most 72 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

const name = z
  .string({ required_error: "Please tell us what to call you." })
  .trim()
  .min(2, "Please enter at least 2 characters.")
  .max(100, "That name is too long.");

/**
 * Optional under GDPR data minimisation — only ask when a feature needs it.
 * The bounds are a sanity check plus the 13+ minimum age for holding an account.
 */
const dateOfBirth = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
  .refine((value) => !Number.isNaN(Date.parse(value)), "That isn't a real date.")
  .refine((value) => {
    const years = (Date.now() - Date.parse(value)) / (365.25 * 24 * 60 * 60 * 1000);
    return years >= 13 && years <= 120;
  }, "You need to be at least 13 years old to create an account.")
  .optional();

const stepToken = z.string().min(1);

/** Same rules as signup's optional dateOfBirth, but required — used when a user adds it after the fact. */
export const updateProfileSchema = z.object({
  dateOfBirth: z
    .string({ required_error: "Please enter your date of birth." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "That isn't a real date.")
    .refine((value) => {
      const years = (Date.now() - Date.parse(value)) / (365.25 * 24 * 60 * 60 * 1000);
      return years >= 13 && years <= 120;
    }, "You need to be at least 13 years old to use this account."),
});

/* Signup */

export const signupStartSchema = z.object({ email });

export const signupVerifySchema = z.object({ email, code });

export const signupCompleteSchema = z
  .object({
    registrationToken: stepToken,
    name,
    dateOfBirth,
    password,
    confirmPassword: z.string({ required_error: "Please confirm your password." }),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "Please accept the terms and privacy policy to continue." }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  });

/* Sign-in */

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: "Please enter your password." }).min(1, "Please enter your password."),
});

export const loginCodeRequestSchema = z.object({ email });

export const loginCodeVerifySchema = z.object({ email, code });

/* Password reset */

export const forgotPasswordSchema = z.object({ email });

export const verifyResetCodeSchema = z.object({ email, code });

export const resetPasswordSchema = z
  .object({
    resetToken: stepToken,
    newPassword: password,
    confirmPassword: z.string({ required_error: "Please confirm your password." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: "Please enter your current password." })
      .min(1, "Please enter your current password."),
    newPassword: password,
    confirmPassword: z.string({ required_error: "Please confirm your new password." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Your new password needs to be different from your current one.",
    path: ["newPassword"],
  });
