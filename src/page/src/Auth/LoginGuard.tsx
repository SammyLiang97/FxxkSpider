import * as React from "react";
import { autobind } from "core-decorators";
import { userInfo, UserContext } from "./userContext";
import Axios from "axios";
import { withRouter, RouteChildrenProps } from "react-router";

const AuthProvider = UserContext.Provider;

interface ILoginGuardState {
    userInfo: {
        loginStatus: boolean;
        username: string;
        role: number[];
    };
    setLoginStatus: (status: boolean) => void;
    setUsername: (username: string) => void;
    checkLoginStatus: () => void;
}

@autobind
class LoginGuard extends React.Component<RouteChildrenProps, ILoginGuardState> {
    public state = {
        userInfo,
        setLoginStatus: this.setLoginStatus,
        setUsername: this.setUsername,
        setUserrole: this.setUserrole,
        checkLoginStatus: this.checkLoginStatus,
    };

    public checkLoginStatus() {
        const pathname = this.props.location.pathname;
        return new Promise((resolve, reject) => {
            Axios.get("/api/user")
                .then((res) => {
                    resolve(true);
                    this.state.setLoginStatus(true);
                    this.state.setUsername(res.data.username);
                    this.state.setUserrole(res.data.role);
                })
                .catch(() => {
                    reject(false);
                    if (pathname !== "/login" && pathname !== "/logout") {
                        this.props.history.push(`/login`);
                    }
                });
        });
    }

    public setLoginStatus(status: boolean) {
        this.state.userInfo.loginStatus = status;
        this.setState(this.state);
    }

    public setUsername(username: string) {
        this.state.userInfo.username = username;
        this.setState(this.state);
    }

    public setUserrole(role: number[]) {
        this.state.userInfo.role = role;
        this.setState(this.state);
    }

    public render() {
        return (
            <AuthProvider value={this.state}>
                {this.props.children}
            </AuthProvider>
        );
    }
}

const LoginGuardWithRouter = withRouter(LoginGuard);

export default LoginGuardWithRouter;
