import * as api from "@client/api";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useSettings } from "@client/hooks/useSettings";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import {
  getLlmProviderConfig,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  normalizeLlmProvider,
} from "@client/pages/settings/utils";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { ValidationResult } from "@shared/types.js";
import { Check, ExternalLink } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ValidationState = ValidationResult & { checked: boolean };

type OnboardingFormData = {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
};

const EMPTY_VALIDATION_STATE: ValidationState = {
  valid: false,
  message: null,
  checked: false,
};

function getStepPrimaryLabel(input: {
  currentStep: string | null;
  llmValidated: boolean;
  profileValidated: boolean;
}): string {
  const toLabel = (isValidated: boolean): string =>
    isValidated ? "Revalidate" : "Validate";

  if (input.currentStep === "llm") return toLabel(input.llmValidated);
  if (input.currentStep === "profile") return toLabel(input.profileValidated);
  return "Validate";
}

export const OnboardingGate: React.FC = () => {
  const {
    settings,
    isLoading: settingsLoading,
    refreshSettings,
  } = useSettings();
  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [isValidatingLlm, setIsValidatingLlm] = useState(false);
  const [isValidatingProfile, setIsValidatingProfile] = useState(false);
  const [llmValidation, setLlmValidation] = useState<ValidationState>(
    EMPTY_VALIDATION_STATE,
  );
  const [profileValidation, setProfileValidation] = useState<ValidationState>(
    EMPTY_VALIDATION_STATE,
  );
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const demoInfo = useDemoInfo();
  const demoMode = demoInfo?.demoMode ?? false;

  const { control, getValues, reset, setValue } = useForm<OnboardingFormData>({
    defaultValues: {
      llmProvider: "",
      llmBaseUrl: "",
      llmApiKey: "",
    },
  });

  const llmProvider = normalizeLlmProvider(
    getValues("llmProvider") || settings?.llmProvider?.value || "openrouter",
  );
  const providerConfig = getLlmProviderConfig(llmProvider);
  const {
    normalizedProvider,
    requiresApiKey: requiresLlmKey,
    showApiKey,
    showBaseUrl,
  } = providerConfig;

  const llmKeyHint = settings?.llmApiKeyHint ?? null;
  const hasLlmKey = Boolean(llmKeyHint);

  const validateLlm = useCallback(async () => {
    const values = getValues();
    setIsValidatingLlm(true);
    try {
      const result = await api.validateLlm({
        provider: normalizedProvider,
        baseUrl: showBaseUrl
          ? values.llmBaseUrl.trim() || undefined
          : undefined,
        apiKey: requiresLlmKey
          ? values.llmApiKey.trim() || undefined
          : undefined,
      });
      setLlmValidation({ ...result, checked: true });
      return result;
    } catch (error) {
      const result = {
        valid: false,
        message:
          error instanceof Error ? error.message : "LLM validation failed",
      };
      setLlmValidation({ ...result, checked: true });
      return result;
    } finally {
      setIsValidatingLlm(false);
    }
  }, [getValues, normalizedProvider, requiresLlmKey, showBaseUrl]);

  const validateProfile = useCallback(async () => {
    setIsValidatingProfile(true);
    try {
      const result = await api.validateResumeConfig();
      setProfileValidation({ ...result, checked: true });
      return result;
    } catch (error) {
      const result = {
        valid: false,
        message:
          error instanceof Error ? error.message : "Profile validation failed",
      };
      setProfileValidation({ ...result, checked: true });
      return result;
    } finally {
      setIsValidatingProfile(false);
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    reset({
      llmProvider: settings.llmProvider?.value || "",
      llmBaseUrl: settings.llmBaseUrl?.value || "",
      llmApiKey: "",
    });
  }, [settings, reset]);

  const llmValidated = requiresLlmKey ? llmValidation.valid : true;
  const hasCheckedValidations =
    (requiresLlmKey ? llmValidation.checked : true) &&
    profileValidation.checked;
  const shouldOpen =
    !demoMode &&
    Boolean(settings && !settingsLoading) &&
    hasCheckedValidations &&
    !(llmValidated && profileValidation.valid);

  const steps = useMemo(
    () => [
      {
        id: "llm",
        label: "LLM Provider",
        subtitle: "Provider + credentials",
        complete: llmValidated,
      },
      {
        id: "profile",
        label: "Profile Hub",
        subtitle: "Internal candidate profile",
        complete: profileValidation.valid,
      },
    ],
    [llmValidated, profileValidation.valid],
  );

  const defaultStep = steps.find((step) => !step.complete)?.id ?? steps[0]?.id;

  useEffect(() => {
    if (!shouldOpen) return;
    if (!currentStep && defaultStep) {
      setCurrentStep(defaultStep);
    }
  }, [currentStep, defaultStep, shouldOpen]);

  const runAllValidations = useCallback(async () => {
    if (!settings) return;
    if (requiresLlmKey) {
      await validateLlm();
    } else {
      setLlmValidation({ valid: true, message: null, checked: true });
    }
    await validateProfile();
  }, [requiresLlmKey, settings, validateLlm, validateProfile]);

  useEffect(() => {
    if (demoMode) return;
    if (!settings || settingsLoading) return;
    const needsValidation =
      (requiresLlmKey ? !llmValidation.checked : false) ||
      !profileValidation.checked;
    if (!needsValidation) return;
    void runAllValidations();
  }, [
    demoMode,
    settings,
    settingsLoading,
    requiresLlmKey,
    llmValidation.checked,
    profileValidation.checked,
    runAllValidations,
  ]);

  const handleSaveLlm = async (): Promise<boolean> => {
    const values = getValues();
    const apiKeyValue = values.llmApiKey.trim();
    const baseUrlValue = values.llmBaseUrl.trim();

    if (requiresLlmKey && !apiKeyValue && !hasLlmKey) {
      toast.info("Add your LLM API key to continue");
      return false;
    }

    try {
      const validation = requiresLlmKey
        ? await validateLlm()
        : { valid: true, message: null };

      if (!validation.valid) {
        toast.error(validation.message || "LLM validation failed");
        return false;
      }

      const update: Partial<UpdateSettingsInput> = {
        llmProvider: normalizedProvider,
        llmBaseUrl: showBaseUrl ? baseUrlValue || null : null,
      };
      if (showApiKey && apiKeyValue) {
        update.llmApiKey = apiKeyValue;
      }

      setIsSavingEnv(true);
      await api.updateSettings(update);
      await refreshSettings();
      setValue("llmApiKey", "");
      toast.success("LLM provider connected");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save LLM settings",
      );
      return false;
    } finally {
      setIsSavingEnv(false);
    }
  };

  const resolvedStepIndex = currentStep
    ? steps.findIndex((step) => step.id === currentStep)
    : 0;
  const stepIndex = resolvedStepIndex >= 0 ? resolvedStepIndex : 0;
  const completedSteps = steps.filter((step) => step.complete).length;
  const progressValue =
    steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;
  const isBusy =
    isSavingEnv || settingsLoading || isValidatingLlm || isValidatingProfile;
  const canGoBack = stepIndex > 0;

  const handlePrimaryAction = async () => {
    if (!currentStep) return;
    if (currentStep === "llm") {
      await handleSaveLlm();
      return;
    }
    if (currentStep === "profile") {
      const result = await validateProfile();
      if (result.valid) {
        toast.success("Profile source ready");
      } else {
        toast.error(result.message || "Profile validation failed");
      }
    }
  };

  const handleBack = () => {
    if (!canGoBack) return;
    setCurrentStep(steps[stepIndex - 1]?.id ?? currentStep);
  };

  if (!shouldOpen || !currentStep) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent
        className="max-h-[90vh] max-w-3xl overflow-hidden p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="max-h-[calc(90vh-3.5rem)] space-y-6 overflow-y-auto px-6 py-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Welcome to Job Ops</AlertDialogTitle>
            <AlertDialogDescription>
              Connect your LLM once, then manage your candidate data in Profile
              Hub. RxResume is no longer part of the main setup flow.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Tabs value={currentStep} onValueChange={setCurrentStep}>
            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 border-b border-border/60 bg-transparent p-0 text-left sm:grid-cols-2">
              {steps.map((step, index) => {
                const isActive = step.id === currentStep;
                return (
                  <FieldLabel
                    key={step.id}
                    className="w-full [&>[data-slot=field]]:rounded-none [&>[data-slot=field]]:border-0 [&>[data-slot=field]]:p-0"
                  >
                    <TabsTrigger
                      value={step.id}
                      className={cn(
                        "w-full rounded-md border-b-2 border-transparent px-3 py-4 text-left shadow-none hover:bg-muted/60",
                        isActive
                          ? "border-primary !bg-muted/60 text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <Field orientation="horizontal" className="items-start">
                        <FieldContent>
                          <FieldTitle>{step.label}</FieldTitle>
                          <FieldDescription>{step.subtitle}</FieldDescription>
                        </FieldContent>
                        <span
                          className={cn(
                            "mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold",
                            step.complete
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {step.complete ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            index + 1
                          )}
                        </span>
                      </Field>
                    </TabsTrigger>
                  </FieldLabel>
                );
              })}
            </TabsList>

            <TabsContent value="llm" className="space-y-4 pt-6">
              <div>
                <p className="text-sm font-semibold">Connect LLM provider</p>
                <p className="text-xs text-muted-foreground">
                  Used for job scoring, AI Copilot, CV drafting, and cover
                  letters.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="llmProvider" className="text-sm font-medium">
                    Provider
                  </label>
                  <Controller
                    name="llmProvider"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={llmProvider}
                        onValueChange={(value) => field.onChange(value)}
                        disabled={isSavingEnv}
                      >
                        <SelectTrigger id="llmProvider">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {LLM_PROVIDERS.map((provider) => (
                            <SelectItem key={provider} value={provider}>
                              {LLM_PROVIDER_LABELS[provider]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    {providerConfig.providerHint}
                  </p>
                </div>

                {showBaseUrl && (
                  <Controller
                    name="llmBaseUrl"
                    control={control}
                    render={({ field }) => (
                      <SettingsInput
                        label="LLM base URL"
                        inputProps={{
                          name: "llmBaseUrl",
                          value: field.value,
                          onChange: field.onChange,
                        }}
                        placeholder={providerConfig.baseUrlPlaceholder}
                        helper={providerConfig.baseUrlHelper}
                        current={settings?.llmBaseUrl?.value || "—"}
                        disabled={isSavingEnv}
                      />
                    )}
                  />
                )}

                {showApiKey && (
                  <Controller
                    name="llmApiKey"
                    control={control}
                    render={({ field }) => (
                      <SettingsInput
                        label="LLM API key"
                        inputProps={{
                          name: "llmApiKey",
                          value: field.value,
                          onChange: field.onChange,
                        }}
                        type="password"
                        placeholder="Enter key"
                        helper={
                          llmKeyHint
                            ? `${providerConfig.keyHelper}. Leave blank to use the saved key.`
                            : providerConfig.keyHelper
                        }
                        disabled={isSavingEnv}
                      />
                    )}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="profile" className="space-y-4 pt-6">
              <div>
                <p className="text-sm font-semibold">Set up your profile</p>
                <p className="text-xs text-muted-foreground">
                  Upload your candidate JSON or fill out the form in Profile
                  Hub. This is now the primary source for AI Copilot, CV
                  preview, and CV PDF export.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                <div className="text-sm text-foreground">
                  {profileValidation.valid
                    ? "Internal candidate profile detected."
                    : profileValidation.message ||
                      "No internal candidate profile found yet."}
                </div>
                <Button asChild variant="outline">
                  <a
                    href="/profile-hub"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Profile Hub
                  </a>
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={!canGoBack || isBusy}
            >
              Back
            </Button>
            <Button onClick={handlePrimaryAction} disabled={isBusy}>
              {isBusy
                ? "Validating..."
                : getStepPrimaryLabel({
                    currentStep,
                    llmValidated,
                    profileValidated: profileValidation.valid,
                  })}
            </Button>
          </div>

          <Progress value={progressValue} className="h-2" />
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
