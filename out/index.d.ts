import { AxiosResponse } from 'axios';
declare class Credential {
    private credential;
    constructor();
    readmoo: string;
    cloudFrontKeyPairId: string;
    cloudFrontPolicy: string;
    cloudFrontSignature: string;
    save(): void;
    private setAWSCredential;
    saveCredentials(res: AxiosResponse): void;
    getHeaders(): {
        Cookie: string;
    };
    private load;
}
export declare const credential: Credential;
export declare function login(email: string, password: string): Promise<void>;
export declare function checkLogin(): Promise<boolean>;
export declare function listBooks(): Promise<any>;
export declare function downloadBook(bookId: string): Promise<string>;
export declare function generateEpub(title: string, dir: string, outputFolder?: string): Promise<string>;
export {};
