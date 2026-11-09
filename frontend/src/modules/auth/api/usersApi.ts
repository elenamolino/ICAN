import { LoginFormProps } from "../components/login-form";
import { RegisterFormProps } from "../components/register-form";

export const USERS_BASE_PATH = import.meta.env.VITE_API_URL + "/users";

export function loginUser(formData: LoginFormProps): Promise<any> {
    return fetch(`${USERS_BASE_PATH}/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
    }).then(async (response) => {
        const parsedResponse = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(parsedResponse.error || "Invalid credentials");
        }
        return parsedResponse;
    })
    .catch((error) => {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    });
}

export function registerUser(formData: RegisterFormProps, setErrors: Function = () => {}): Promise<any> {
    return fetch(`${USERS_BASE_PATH}/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
    }).then(async (response) => {

        const parsedResponse = await response.json();

        if (!response.ok) {
            throw new Error(parsedResponse.error);
        }
        
        return parsedResponse;
    })
    .catch((error: Error) => {
        if (Array.isArray(error)) {
            setErrors(error);
        }else{
            setErrors([error.message]);
        }
        return Promise.reject(error);
    });
}

export function exchangeSsoCode(code: string): Promise<{ token: string }> {
    return fetch(`${USERS_BASE_PATH}/auth/sso/us/exchange?code=${encodeURIComponent(code)}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    }).then(async (response) => {
        const parsedResponse = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(parsedResponse.error || "SSO exchange failed");
        }
        return parsedResponse;
    });
}

/** URL that starts a sign-in with a provider, or connects it to the account when `linkTicket` is given. */
export function ssoInitiateUrl(provider: string, linkTicket?: string): string {
    const url = `${USERS_BASE_PATH}/auth/sso/${provider}/initiate`;
    return linkTicket ? `${url}?link=${encodeURIComponent(linkTicket)}` : url;
}

let ssoProvidersPromise: Promise<string[]> | null = null;

/** Providers this deployment configured (URL segments such as `us`, `google`, `sphere`), fetched once. */
export function getSsoProviders(): Promise<string[]> {
    ssoProvidersPromise ??= fetch(`${USERS_BASE_PATH}/auth/sso/providers`)
        .then(async (response) => {
            const parsedResponse = await response.json().catch(() => ({}));
            if (!response.ok || !Array.isArray(parsedResponse.providers)) {
                throw new Error("Could not load the sign-in methods");
            }
            return parsedResponse.providers as string[];
        })
        .catch((error) => {
            ssoProvidersPromise = null; // try again next time
            throw error;
        });
    return ssoProvidersPromise;
}

export function getCurrentUser(token: string): Promise<any> {
    return fetch(`${USERS_BASE_PATH}/me`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
    }).then(async (response) => {
        const parsedResponse = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(parsedResponse.error || "Could not retrieve session user");
        }
        return parsedResponse;
    });
}
