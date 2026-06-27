import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin } from "@workspace/api-client-react";
import { setToken, setUser } from "@/lib/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Lock, User, Eye, EyeOff, LogIn } from "lucide-react";

// NOTE: Validation schema and field names are intentionally unchanged.
const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Zero-asset Riviera brand lockup (inline SVG + text).
 * Kept local to the login page to limit the change to a single file
 * and avoid adding image assets / bundle weight.
 */
function RivieraLogo() {
  return (
    <div className="flex flex-col items-center gap-3" aria-label="Riviera Building Management">
      <svg
        viewBox="0 0 80 80"
        className="h-16 w-16"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="riviera-monogram" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C8A86B" />
            <stop offset="100%" stopColor="#102A43" />
          </linearGradient>
        </defs>
        <text
          x="50%"
          y="56%"
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="62"
          fill="url(#riviera-monogram)"
        >
          R
        </text>
      </svg>

      <div className="flex flex-col items-center gap-1">
        <span className="font-[Inter] text-[28px] font-bold leading-none tracking-[0.32em] text-[#102A43]">
          RIVIERA
        </span>
        <span className="font-[Inter] text-[11px] font-medium tracking-[0.42em] text-[#C8A86B]">
          BUILDING MANAGEMENT
        </span>
      </div>

      <span className="mt-2 h-px w-16 bg-gradient-to-l from-transparent via-[#C8A86B] to-transparent" />
    </div>
  );
}

/** Soft decorative botanical sprig rendered as inline vector (no raster, no asset). */
function LeafSprig({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="#8A9A6B" strokeWidth="2" strokeLinecap="round">
        <path d="M30 170 C 70 130, 110 90, 170 40" />
        {[
          [60, 142],
          [82, 120],
          [104, 98],
          [126, 76],
          [148, 56],
        ].map(([x, y], i) => (
          <g key={i}>
            <path
              d={`M${x} ${y} q -18 -10 -30 -4 q 6 14 30 4`}
              fill="#A8B589"
              fillOpacity="0.5"
              stroke="none"
            />
            <path
              d={`M${x} ${y} q 18 10 30 4 q -6 -14 -30 -4`}
              fill="#C2CBA6"
              fillOpacity="0.45"
              stroke="none"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();

  // Presentational-only state for the password visibility toggle.
  // Works entirely client-side; does not touch auth / session handling.
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // ── Authentication logic preserved exactly as the original implementation. ──
  const onSubmit = (data: LoginFormValues) => {
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          setToken(res.token);
          setUser(res.user);
          setLocation("/dashboard");
        },
        onError: () => {
          toast({
            title: "فشل تسجيل الدخول",
            description: "تأكد من صحة اسم المستخدم وكلمة المرور",
            variant: "destructive",
          });
        },
      }
    );
  };

  const inputBaseClass =
    "h-14 rounded-2xl border-[#E8ECEF] bg-white/70 ps-12 text-[15px] text-[#1E293B] " +
    "placeholder:text-[#94A3B8] transition-all duration-200 " +
    "focus-visible:border-[#C8A86B] focus-visible:ring-4 focus-visible:ring-[#C8A86B]/15";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#FCFCFA]">
      {/* ───────────────── Decorative background (CSS + vector only) ───────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* layered radial washes */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_85%_5%,#F6F3EE_0%,transparent_45%),radial-gradient(100%_100%_at_5%_95%,#F3EFE7_0%,transparent_50%)]" />

        {/* blurred abstract circles */}
        <div className="absolute -top-32 -start-24 h-[26rem] w-[26rem] rounded-full bg-[#EFE7D6] opacity-60 blur-3xl" />
        <div className="absolute top-1/3 start-1/4 h-40 w-40 rounded-full bg-white opacity-70 blur-3xl" />
        <div className="absolute -bottom-32 end-1/4 h-[24rem] w-[24rem] rounded-full bg-[#F1EDE4] opacity-60 blur-3xl" />

        {/* very soft golden curves */}
        <div className="absolute -top-40 -end-40 h-[34rem] w-[34rem] rounded-full border border-[#C8A86B]/15" />
        <div className="absolute -bottom-56 -start-40 h-[40rem] w-[40rem] rounded-full border border-[#C8A86B]/10" />

        {/* botanical leaves — top-right & bottom-left only */}
        <LeafSprig className="absolute -top-6 end-0 h-64 w-64 rotate-[18deg] opacity-70" />
        <LeafSprig className="absolute -bottom-8 start-0 h-72 w-72 -rotate-[200deg] opacity-60" />
      </div>

      {/* ───────────────────────────── Content ───────────────────────────── */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-16 px-6 py-16 lg:flex-row-reverse lg:gap-20 lg:px-12">
        {/* Brand column (≈45%) */}
        <section className="flex w-full flex-col items-center text-center duration-700 animate-in fade-in slide-in-from-bottom-4 motion-reduce:animate-none lg:w-[45%]">
          <RivieraLogo />

          <h1 className="mt-10 text-3xl font-bold leading-snug text-[#102A43] sm:text-[34px]">
            مرحباً بك في نظام عمارة الريفيرا
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-8 text-[#64748B]">
            سجل دخولك للوصول إلى لوحة التحكم وإدارة خدمات العمارة
          </p>

          <span className="mt-8 flex items-center gap-3 text-[#C8A86B]">
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-[#C8A86B]/70" />
            <span className="text-xs">✦</span>
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-[#C8A86B]/70" />
          </span>
        </section>

        {/* Login column (≈55%) */}
        <section className="flex w-full justify-center lg:w-[55%]">
          <div className="relative w-[460px] max-w-full pt-9">
            {/* floating gold-lock badge, overlapping the card top */}
            <div className="absolute start-1/2 top-0 z-20 flex h-[72px] w-[72px] -translate-x-1/2 items-center justify-center rounded-full border border-white/70 bg-white shadow-[0_18px_40px_rgba(16,42,67,0.12)] rtl:translate-x-1/2">
              <Lock className="!h-7 !w-7 text-[#C8A86B]" strokeWidth={2.2} />
            </div>

            {/* floating card */}
            <div
              className={cn(
                "relative w-full rounded-[30px] border border-white/65 bg-[rgba(255,255,255,0.92)]",
                "px-8 pb-10 pt-16 backdrop-blur-[20px] sm:px-10",
                "shadow-[0_45px_100px_rgba(0,0,0,0.10),0_20px_50px_rgba(0,0,0,0.06),inset_0_4px_10px_rgba(255,255,255,0.8)]",
                "duration-700 animate-in fade-in slide-in-from-bottom-4 motion-reduce:animate-none"
              )}
            >
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-[#102A43]">تسجيل الدخول</h2>
                <p className="mt-2 text-sm text-[#64748B]">
                  يرجى إدخال بياناتك لتسجيل الدخول
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  {/* Username */}
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-[#334155]">
                          اسم المستخدم
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User
                              className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94A3B8]"
                              aria-hidden="true"
                            />
                            <Input
                              placeholder="أدخل اسم المستخدم"
                              autoComplete="username"
                              className={inputBaseClass}
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Password */}
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="text-sm font-medium text-[#334155]">
                          كلمة المرور
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock
                              className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94A3B8]"
                              aria-hidden="true"
                            />
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="أدخل كلمة المرور"
                              autoComplete="current-password"
                              className={cn(inputBaseClass, "pe-12")}
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              aria-label={
                                showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                              }
                              aria-pressed={showPassword}
                              className="absolute end-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F6F3EE] hover:text-[#102A43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A86B]/40"
                            >
                              {showPassword ? (
                                <EyeOff className="h-5 w-5" />
                              ) : (
                                <Eye className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Primary submit — navy → gold on hover */}
                  <Button
                    type="submit"
                    disabled={loginMutation.isPending}
                    className={cn(
                      "mt-1 h-14 w-full rounded-2xl bg-[#102A43] text-base font-semibold text-white",
                      "shadow-[0_12px_30px_rgba(16,42,67,0.22)] transition-all duration-300",
                      "hover:-translate-y-0.5 hover:bg-[#C8A86B] hover:text-[#102A43] hover:shadow-[0_16px_36px_rgba(200,168,107,0.30)]",
                      "motion-reduce:hover:translate-y-0"
                    )}
                  >
                    {loginMutation.isPending ? (
                      "جاري الدخول..."
                    ) : (
                      <>
                        <LogIn className="h-5 w-5" />
                        تسجيل الدخول
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>

            <p className="mt-6 text-center text-xs text-[#94A3B8]">
              نظام إدارة عمارة الريفيرا &copy; {new Date().getFullYear()}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
