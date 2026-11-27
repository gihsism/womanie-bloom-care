import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-sm group-[.toaster]:border group-[.toaster]:border-foreground/20 group-[.toaster]:border-t-2 group-[.toaster]:border-t-foreground group-[.toaster]:bg-card group-[.toaster]:font-sans group-[.toaster]:text-foreground group-[.toaster]:shadow-none",
          title: "group-[.toast]:font-display group-[.toast]:text-base group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:rounded-sm group-[.toast]:border group-[.toast]:border-foreground/40 group-[.toast]:bg-transparent group-[.toast]:font-mono group-[.toast]:uppercase group-[.toast]:tracking-[0.08em] group-[.toast]:text-foreground",
          cancelButton: "group-[.toast]:rounded-sm group-[.toast]:bg-transparent group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
