import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	safelist: [
		'text-haven', 'text-necro',
		'bg-haven', 'bg-necro',
		'bg-haven/10', 'bg-haven/12', 'bg-haven/15', 'bg-haven/20', 'bg-haven/30',
		'bg-necro/10', 'bg-necro/12', 'bg-necro/15', 'bg-necro/20', 'bg-necro/30',
		'border-haven', 'border-haven/30', 'border-haven/40', 'border-haven/50',
		'border-necro', 'border-necro/30', 'border-necro/40',
		'hover:bg-haven/10', 'hover:bg-necro/10',
		'border-2',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				display: ['Cinzel', 'serif'],
				serif: ['Marcellus', 'serif'],
				sans: ['Rubik', 'sans-serif'],
			},
			colors: {
				haven: {
					DEFAULT: 'hsl(var(--haven))',
					glow: 'hsl(var(--haven-glow))',
				},
				necro: {
					DEFAULT: 'hsl(var(--necro))',
					glow: 'hsl(var(--necro-glow))',
				},
				gold: 'hsl(var(--gold))',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'fade-in': {
					from: { opacity: '0', transform: 'translateY(10px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				},
				'scale-in': {
					from: { opacity: '0', transform: 'scale(0.9)' },
					to: { opacity: '1', transform: 'scale(1)' }
				},
				'hit-shake': {
					'0%,100%': { transform: 'translateX(0)' },
					'25%': { transform: 'translateX(-4px)' },
					'75%': { transform: 'translateX(4px)' }
				},
				'glow-pulse': {
					'0%,100%': { boxShadow: '0 0 0 0 var(--ring-glow)' },
					'50%': { boxShadow: '0 0 18px 3px var(--ring-glow)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.4s ease-out',
				'scale-in': 'scale-in 0.3s ease-out',
				'hit-shake': 'hit-shake 0.3s ease-in-out',
				'glow-pulse': 'glow-pulse 1.8s ease-in-out infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;