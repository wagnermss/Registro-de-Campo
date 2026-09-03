import { Pressable, Text, type PressableProps } from "react-native";

type AppButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  color?: string;
};

const variantClasses = {
  default: {
    button: "bg-field-600",
    label: "text-white",
  },
  secondary: {
    button: "border border-line bg-white",
    label: "text-field-800",
  },
  destructive: {
    button: "bg-danger",
    label: "text-white",
  },
  warning: {
    button: "bg-amber",
    label: "text-ink",
  },
} as const;

export function AppButton({
  title,
  color,
  disabled,
  style,
  ...props
}: AppButtonProps) {
  const variant =
    color === "#a21d22"
      ? variantClasses.destructive
      : color === "#a86600"
        ? variantClasses.warning
        : color
          ? variantClasses.secondary
          : variantClasses.default;

  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-11 items-center justify-center rounded-field px-4 py-3 ${variant.button} ${disabled ? "opacity-45" : ""}`}
      disabled={disabled}
      style={(state) => [
        { opacity: state.pressed && !disabled ? 0.82 : undefined },
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      <Text className={`text-sm font-bold ${variant.label}`}>{title}</Text>
    </Pressable>
  );
}
