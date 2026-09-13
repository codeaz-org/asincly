import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// One primary action per screen: `primary` is amber and should appear once.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-transparent text-sm font-medium whitespace-nowrap transition-[background,color,border-color,transform,opacity] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-ground active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-amber text-amber-ink font-semibold hover:bg-[oklch(0.83_0.15_60)]",
        secondary: "bg-ink/[0.06] text-ink border-line hover:bg-ink/[0.1] hover:border-line-strong",
        ghost: "text-soft hover:text-ink hover:bg-ink/[0.05]",
        quiet: "text-soft hover:text-ink underline-offset-4 hover:underline px-0",
        danger: "text-danger border-danger/30 bg-danger/[0.06] hover:bg-danger/[0.12]",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-lg",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-9 rounded-lg",
        "icon-sm": "size-7 rounded-md",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
