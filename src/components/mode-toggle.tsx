import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ModeToggle() {
	const { theme, setTheme } = useTheme();

	return (
		<Button
			variant="ghost"
			size="icon"
			className="h-9 w-9 text-muted-foreground hover:text-foreground"
			onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
			aria-label={
				theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
			}
		>
			{theme === "dark" ? (
				<Sun className="h-4 w-4" />
			) : (
				<Moon className="h-4 w-4" />
			)}
		</Button>
	);
}
