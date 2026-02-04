import { AlertCircle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
		error: null,
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
		this.props.onError?.(error, errorInfo);
	}

	public render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="min-h-screen bg-background flex items-center justify-center p-6">
					<div className="max-w-md w-full space-y-4 text-center">
						<div className="flex justify-center">
							<div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
								<AlertCircle className="h-6 w-6 text-destructive" />
							</div>
						</div>
						<h2 className="text-2xl font-bold tracking-tight">
							Something went wrong
						</h2>
						<p className="text-muted-foreground">
							An unexpected error occurred. Please try refreshing the page.
						</p>
						{this.state.error && (
							<pre
								className={cn(
									"text-xs text-left bg-muted p-4 rounded-md overflow-auto max-h-40",
									"border border-border",
								)}
							>
								{this.state.error.message}
							</pre>
						)}
						<Button onClick={() => window.location.reload()} className="w-full">
							Refresh Page
						</Button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
