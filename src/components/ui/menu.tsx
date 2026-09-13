"use client";

import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { cn } from "cn";

// Styled Base UI menu + popover parts. Keyboard, focus and dismissal come
// from Base UI; this file only owns the look.

const surface =
  "z-50 rounded-2xl border border-line bg-popover/95 backdrop-blur-xl p-1.5 text-ink shadow-[0_24px_60px_-20px_oklch(0_0_0/0.7)] outline-none origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.97]";

const itemClass =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink/90 outline-none cursor-default select-none data-[highlighted]:bg-ink/[0.07] data-[highlighted]:text-ink";

export const MenuRoot = Menu.Root;

export function MenuTrigger({ className, ...props }: Menu.Trigger.Props) {
  return (
    <Menu.Trigger
      className={cn(
        "outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-lg",
        typeof className === "string" ? className : undefined,
      )}
      {...props}
    />
  );
}

export function MenuContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={8} align={align} className="z-50">
        <Menu.Popup className={cn(surface, "min-w-56", className)}>{children}</Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function MenuLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Menu.LinkItem closeOnClick render={<Link href={href} />} className={cn(itemClass, className)}>
      {children}
    </Menu.LinkItem>
  );
}

export function MenuItem({ className, ...props }: Menu.Item.Props) {
  return <Menu.Item className={cn(itemClass, typeof className === "string" ? className : undefined)} {...props} />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-2 pb-1.5 kicker text-[10px]">{children}</div>;
}

export function MenuSeparator() {
  return <Menu.Separator className="my-1.5 h-px bg-line" />;
}

export const PopoverRoot = Popover.Root;
export const PopoverTrigger = Popover.Trigger;
export const PopoverClose = Popover.Close;

export function PopoverContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Popover.Portal>
      <Popover.Positioner sideOffset={8} align={align} collisionPadding={12} className="z-50">
        <Popover.Popup className={cn(surface, className)}>{children}</Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}
