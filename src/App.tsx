import { StoreProvider, useStore } from "./logic/store";
import { Bench } from "./components/Bench";

function Footer() {
  const { dispatch } = useStore();
  return (
    <footer className="app-footer">
      <span>
        数据保存在本机浏览器（localStorage），刷新 / 重开页面状态一致；所有称量与判级只追加、不改写。
      </span>
      <button
        className="ghost"
        onClick={() => {
          if (window.confirm("重置为演示数据？当前所有批次记录将被清除。"))
            dispatch({ type: "resetAll" });
        }}
      >
        重置演示数据
      </button>
    </footer>
  );
}

function App() {
  return (
    <StoreProvider>
      <Bench />
      <Footer />
    </StoreProvider>
  );
}

export default App;
