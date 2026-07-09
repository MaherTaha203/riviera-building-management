import { useEffect, useState } from "react";
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
import { pmark } from "@/lib/perf";
import { resolveApiBaseUrl } from "@/lib/config";
import { Lock, User, Eye, EyeOff, LogIn, Loader2 } from "lucide-react";

// Phase 1 (perceived performance) — warm-on-intent.
// The dominant cost is a Render container cold start that happens BEFORE the
// login request is processed. We can overlap that wake with the seconds the
// user spends typing: the moment they focus the form, fire a silent, one-time
// health ping so the instance is already warming by the time they submit.
// Fire-and-forget; every error is swallowed — the user must never see it.
let warmed = false;
function warmBackend(): void {
  if (warmed) return;
  warmed = true;
  try {
    const url = `${resolveApiBaseUrl()}/api/healthz`;
    void fetch(url, { method: "GET", cache: "no-store", keepalive: true }).catch(() => {});
  } catch {
    /* API base not resolvable yet — ignore */
  }
}

// NOTE: Validation schema and field names are intentionally unchanged.
const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Riviera brand lockup — Concept 1 (Champagne Luxury) reference:
 * Playfair Display solid-gold monogram, spaced RIVIERA wordmark, gold tag,
 * gold gradient divider. Zero image assets.
 */
function RivieraLogo() {
  return (
    <div className="flex flex-col items-center" aria-label="Riviera Building Management">
      <div className="font-['Playfair_Display',Georgia,serif] text-[64px] font-bold leading-none text-[#C8A86B]">
        R
      </div>
      <div className="mt-2.5 font-[Inter] text-[28px] font-bold leading-none tracking-[0.34em] text-[#102A43]">
        RIVIERA
      </div>
      <div className="mt-1.5 font-[Inter] text-[11px] font-semibold tracking-[0.42em] text-[#C8A86B]">
        BUILDING MANAGEMENT
      </div>
      <span className="my-[26px] h-px w-[72px] bg-gradient-to-l from-transparent via-[#C8A86B] to-transparent" />
    </div>
  );
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();

  // Presentational-only state for the password visibility toggle.
  // Works entirely client-side; does not touch auth / session handling.
  const [showPassword, setShowPassword] = useState(false);

  // Phase 1 — how many seconds the sign-in request has been in flight, so we
  // can narrate an honest, escalating status instead of a frozen spinner
  // during a cold-start wake. Presentational only.
  const [elapsed, setElapsed] = useState(0);
  const isPending = loginMutation.isPending;

  // Prefetch the lazy dashboard chunk while the user is on the login page, so
  // after a successful sign-in there is no second "loading" flash waiting on
  // the code to download. Fire-and-forget; ignore failures.
  useEffect(() => {
    void import("@/pages/dashboard").catch(() => {});
  }, []);

  // Tick the elapsed counter only while the request is in flight.
  useEffect(() => {
    if (!isPending) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isPending]);

  // Honest, elapsed-tied status. Frames a long wait as the server *waking*, not
  // as the app being broken. No fake percentage — an indeterminate bar carries
  // the "we're working, duration unknown" signal.
  const stageMsg =
    elapsed >= 24 ? "اقتربنا، جارٍ إعداد لوحة التحكم…" :
    elapsed >= 12 ? "الخادم يستيقظ بعد فترة خمول، لحظات من فضلك…" :
    elapsed >= 4 ? "جارٍ تجهيز الخادم…" :
    "جاري تسجيل الدخول…";

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // ── Authentication logic preserved exactly as the original implementation. ──
  const onSubmit = (data: LoginFormValues) => {
    pmark("login:click");
    pmark("login:request");
    loginMutation.mutate(
      { data },
      {
        onSuccess: (res) => {
          pmark("login:response");
          setToken(res.token);
          setUser(res.user);
          pmark("login:tokenStored");
          pmark("login:redirect");
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
      {/* ── Decorative background — Concept 1 geometry (washes, blobs, gold rings) ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* layered radial washes */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_85%_5%,#F6F3EE_0%,transparent_45%),radial-gradient(100%_100%_at_5%_95%,#F3EFE7_0%,transparent_50%)]" />

        {/* blurred champagne blobs (physical positions per the reference) */}
        <div className="absolute -top-[160px] -right-[120px] h-[420px] w-[420px] rounded-full bg-[#EFE7D6] opacity-[0.65] blur-[70px]" />
        <div className="absolute -bottom-[140px] left-[22%] h-[380px] w-[380px] rounded-full bg-[#F1EDE4] opacity-60 blur-[70px]" />

        {/* thin gold rings */}
        <div className="absolute -top-[230px] -left-[180px] h-[540px] w-[540px] rounded-full border-[1.5px] border-[#C8A86B]/[0.22]" />
        <div className="absolute -bottom-[280px] -right-[200px] h-[620px] w-[620px] rounded-full border-[1.5px] border-[#C8A86B]/[0.22]" />
      </div>

      {/* ───────────────────────────── Content ───────────────────────────── */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1160px] flex-col items-center justify-center gap-16 px-6 py-16 lg:flex-row lg:gap-20 lg:px-10">
        {/* Brand column — first in RTL flow = right side, as in the reference */}
        <section className="flex w-full flex-col items-center text-center duration-700 animate-in fade-in slide-in-from-bottom-4 motion-reduce:animate-none lg:w-[45%]">
          <RivieraLogo />

          <h1 className="text-[32px] font-bold leading-snug text-[#102A43]">
            مرحباً بك في نظام عمارة الريفيرا
          </h1>
          <p className="mt-3 max-w-[360px] text-[15px] leading-8 text-[#64748B]">
            سجل دخولك للوصول إلى لوحة التحكم وإدارة خدمات العمارة
          </p>
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
                "px-8 pb-11 pt-16 backdrop-blur-[20px] sm:px-10",
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
                              onFocus={warmBackend}
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
                    {isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                        جاري الدخول...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-5 w-5" />
                        تسجيل الدخول
                      </>
                    )}
                  </Button>

                  {/* Phase 1 — indeterminate progress + honest staged status.
                      Shown only while the request is in flight. */}
                  {isPending && (
                    <div aria-live="polite">
                      <div
                        className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-[#E8ECEF]"
                        role="progressbar"
                        aria-label="جاري المعالجة"
                      >
                        <div className="rv-indeterminate-bar h-full w-1/3 rounded-full bg-[#C8A86B]" />
                      </div>
                      <p className="mt-3 text-center text-[13px] text-[#64748B]">{stageMsg}</p>
                      {elapsed >= 6 && (
                        <p className="mt-1 text-center text-[11.5px] text-[#94A3B8]">
                          قد يستغرق أول دخول بعد فترة خمول ما يصل إلى 40 ثانية — هذا طبيعي.
                        </p>
                      )}
                    </div>
                  )}
                </form>
              </Form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
