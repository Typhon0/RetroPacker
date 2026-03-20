import * as React from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
	onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
		this.props.onError?.(error, errorInfo);
	}

	handleReload = (): void => {
		window.location.reload();
	};

	render(): React.ReactNode {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
					<div className="max-w-md">
						<h2 className="text-lg font-semibold text-foreground mb-2">
							Something went wrong
						</h2>
						<p className="text-sm text-muted-foreground mb-4">
							An unexpected error occurred. Please try reloading the
							application.
						</p>
						{this.state.error && (
							<p className="text-xs text-destructive mb-4 font-mono">
								{this.state.error.message}
							</p>
						)}
						<Button type="button" onClick={this.handleReload}>
							Reload Application
						</Button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
