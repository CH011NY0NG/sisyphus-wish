import {
  Analytics,
  contactsViral,
  getTossShareLink,
  grantPromotionReward,
  requestNotificationAgreement,
  requestReview,
  share,
} from "@apps-in-toss/web-framework";
import { useMemo, useRef, useState } from "react";
import "./App.css";

type StatusType = "idle" | "success" | "warning" | "error";

type Status = {
  type: StatusType;
  title: string;
  description: string;
};

type FeatureKey =
  | "promotion"
  | "review"
  | "smartMessage"
  | "contactsViral"
  | "share"
  | "analytics";

const initialStatus: Status = {
  type: "idle",
  title: "성장 기능을 테스트해 보세요.",
  description:
    "각 버튼은 개발자센터의 유입 & 성장 기능을 기준으로 만든 최소 실행 예제예요.",
};

const featureTabs: Array<{ key: FeatureKey; label: string }> = [
  { key: "promotion", label: "프로모션" },
  { key: "review", label: "리뷰 요청" },
  { key: "smartMessage", label: "스마트 발송" },
  { key: "contactsViral", label: "공유 리워드" },
  { key: "share", label: "공유" },
  { key: "analytics", label: "분석" },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "알 수 없는 오류";
  }
}

function getReferrerFromUrl() {
  const params = new URLSearchParams(window.location.search);

  // 토스 앱은 미니앱 진입 경로를 referrer 파라미터로 전달해요.
  // 예: ?referrer=push, ?referrer=benefit_tab, ?referrer=external_share
  return params.get("referrer") ?? "직접 실행 또는 로컬 개발 환경";
}

function App() {
  const [selectedFeature, setSelectedFeature] =
    useState<FeatureKey>("promotion");
  const [status, setStatus] = useState<Status>(initialStatus);
  const [isLoading, setIsLoading] = useState(false);

  const [promotionCode, setPromotionCode] = useState("EVENT_2026");
  const [promotionAmount, setPromotionAmount] = useState(100);
  const [hasPromotionGranted, setHasPromotionGranted] = useState(false);

  const [templateCode, setTemplateCode] = useState("RESTOCK_ALERT_TEMPLATE");
  const [contactsViralModuleId, setContactsViralModuleId] = useState(
    "00000000-0000-0000-0000-000000000000",
  );

  const [deepLinkPath, setDeepLinkPath] = useState("intoss://growth");
  const [ogImageUrl, setOgImageUrl] = useState(
    "https://static.toss.im/icons/png/4x/icon-share-dots-mono.png",
  );
  const [generatedShareLink, setGeneratedShareLink] = useState("");

  const [analyticsEventName, setAnalyticsEventName] =
    useState("growth_cta_click");
  const [analyticsTarget, setAnalyticsTarget] = useState("promotion_reward");

  const notificationCleanupRef = useRef<(() => void) | null>(null);
  const contactsViralCleanupRef = useRef<(() => void) | null>(null);

  const referrer = useMemo(getReferrerFromUrl, []);

  const setWorking = (title: string, description: string) => {
    setStatus({ type: "idle", title, description });
  };

  const setSuccess = (title: string, description: string) => {
    setStatus({ type: "success", title, description });
  };

  const setWarning = (title: string, description: string) => {
    setStatus({ type: "warning", title, description });
  };

  const setError = (title: string, description: string) => {
    setStatus({ type: "error", title, description });
  };

  const handleGrantPromotionReward = async () => {
    const trimmedPromotionCode = promotionCode.trim();

    if (trimmedPromotionCode.length === 0) {
      setError("프로모션 코드가 필요해요.", "콘솔에서 발급한 코드를 입력해 주세요.");
      return;
    }

    if (promotionAmount <= 0) {
      setError("지급 금액을 확인해 주세요.", "amount는 1 이상의 숫자여야 해요.");
      return;
    }

    if (hasPromotionGranted) {
      setWarning(
        "중복 지급을 막았어요.",
        "실서비스에서는 주문 ID, 미션 ID, 사용자 ID 같은 멱등 키로 중복 호출을 막아야 해요.",
      );
      return;
    }

    try {
      setIsLoading(true);
      setWorking(
        "프로모션 리워드를 지급하고 있어요.",
        "grantPromotionReward는 토스앱 5.232.0 이상에서 동작해요.",
      );

      // 비게임 미니앱에서 서버 없이 토스 포인트 프로모션을 지급하는 예제예요.
      // 게임 미니앱은 같은 파라미터로 grantPromotionRewardForGame을 사용해요.
      const result = await grantPromotionReward({
        params: {
          promotionCode: trimmedPromotionCode,
          amount: promotionAmount,
        },
      });

      if (result == null) {
        setWarning(
          "지원하지 않는 토스앱 버전이에요.",
          "토스앱 최소 지원 버전보다 낮으면 undefined가 반환돼요.",
        );
        return;
      }

      if (result === "ERROR") {
        setError(
          "프로모션 지급 중 오류가 발생했어요.",
          "일시적인 오류일 수 있어요. 재시도 전 중복 지급 방어 로직을 확인해 주세요.",
        );
        return;
      }

      if ("key" in result) {
        setHasPromotionGranted(true);
        setSuccess(
          "프로모션 지급 요청이 성공했어요.",
          `지급 key: ${result.key}`,
        );
        return;
      }

      const code = "errorCode" in result ? result.errorCode : result.code;
      setError(
        "프로모션 지급이 거절됐어요.",
        `에러 코드: ${code}. 콘솔의 프로모션 상태와 예산을 확인해 주세요.`,
      );
    } catch (error) {
      setError("프로모션 지급 호출에 실패했어요.", getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestReview = async () => {
    try {
      setIsLoading(true);
      setWorking(
        "리뷰 요청을 호출하고 있어요.",
        "requestReview는 사용자가 만족감을 느끼는 시점에만 호출하는 것을 권장해요.",
      );

      // 리뷰 UI는 내부 피로도 정책에 따라 노출되지 않을 수 있어요.
      // 따라서 이 Promise 결과에 따라 보상 지급이나 다음 화면 이동을 결정하면 안 돼요.
      await requestReview();

      setSuccess(
        "리뷰 요청 호출이 완료됐어요.",
        "리뷰 작성 여부나 dismiss 여부는 SDK에서 제공하지 않아요.",
      );
    } catch (error) {
      setError("리뷰 요청에 실패했어요.", getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestNotificationAgreement = () => {
    const trimmedTemplateCode = templateCode.trim();

    if (trimmedTemplateCode.length === 0) {
      setError("템플릿 코드가 필요해요.", "스마트 발송 캠페인의 templateCode를 입력해 주세요.");
      return;
    }

    notificationCleanupRef.current?.();
    setWorking(
      "알림 동의문을 요청하고 있어요.",
      "동의 결과를 받은 뒤에는 cleanup 함수를 호출해서 이벤트 리스너를 해제해야 해요.",
    );

    let cleanup: (() => void) | undefined;

    try {
      cleanup = requestNotificationAgreement({
        options: {
          // templateCode는 알림 동의문이 연결된 기능성 캠페인의 발송 코드예요.
          templateCode: trimmedTemplateCode,
        },
        onEvent: ({ type }) => {
          if (type === "newAgreement") {
            setSuccess(
              "사용자가 새로 알림 수신에 동의했어요.",
              "이제 파트너 서버에서 스마트 발송 API를 호출할 수 있어요.",
            );
          } else if (type === "alreadyAgreed") {
            setSuccess(
              "이미 동의된 사용자예요.",
              "추가 동의 UI 없이 결과가 반환됐어요.",
            );
          } else {
            setWarning(
              "사용자가 알림 수신을 거부했어요.",
              "동의가 필요한 메시지는 발송하지 않는 흐름으로 처리해 주세요.",
            );
          }

          cleanup?.();
          notificationCleanupRef.current = null;
        },
        onError: (error) => {
          setError("알림 동의 요청에 실패했어요.", getErrorMessage(error));
          cleanup?.();
          notificationCleanupRef.current = null;
        },
      });

      notificationCleanupRef.current = cleanup;
    } catch (error) {
      cleanup?.();
      notificationCleanupRef.current = null;
      setError("알림 동의 요청을 시작하지 못했어요.", getErrorMessage(error));
    }
  };

  const handleContactsViral = () => {
    const trimmedModuleId = contactsViralModuleId.trim();

    if (trimmedModuleId.length === 0) {
      setError("공유 리워드 ID가 필요해요.", "콘솔에서 발급한 moduleId를 입력해 주세요.");
      return;
    }

    contactsViralCleanupRef.current?.();
    setWorking(
      "공유 리워드 모듈을 열고 있어요.",
      "샌드박스 앱에서는 실제 공유 UI가 빈 화면으로 보일 수 있어요.",
    );

    let cleanup: (() => void) | undefined;

    try {
      cleanup = contactsViral({
        options: {
          // moduleId는 콘솔의 미니앱 > 공유 리워드 메뉴에서 확인하는 UUID예요.
          moduleId: trimmedModuleId,
        },
        onEvent: (event) => {
          if (event.type === "sendViral") {
            setSuccess(
              "친구에게 공유를 완료했어요.",
              `${event.data.rewardAmount}${event.data.rewardUnit} 리워드를 지급할 수 있어요.`,
            );
            return;
          }

          setSuccess(
            "공유 리워드 모듈이 종료됐어요.",
            `종료 사유: ${event.data.closeReason}, 공유 완료 수: ${event.data.sentRewardsCount}`,
          );
          cleanup?.();
          contactsViralCleanupRef.current = null;
        },
        onError: (error) => {
          setError("공유 리워드 실행 중 오류가 발생했어요.", getErrorMessage(error));
          cleanup?.();
          contactsViralCleanupRef.current = null;
        },
      });

      contactsViralCleanupRef.current = cleanup;
    } catch (error) {
      cleanup?.();
      contactsViralCleanupRef.current = null;
      setError("공유 리워드를 시작하지 못했어요.", getErrorMessage(error));
    }
  };

  const handleCreateShareLink = async () => {
    const trimmedDeepLinkPath = deepLinkPath.trim();
    const trimmedOgImageUrl = ogImageUrl.trim();

    if (!trimmedDeepLinkPath.startsWith("intoss://")) {
      setError("딥링크 형식을 확인해 주세요.", "공유 경로는 intoss://로 시작해야 해요.");
      return;
    }

    try {
      setIsLoading(true);
      setWorking(
        "토스앱 공유 링크를 만들고 있어요.",
        "출시 전에는 QR 코드의 intoss-private:// 테스트 스킴을 사용해 주세요.",
      );

      // getTossShareLink는 토스 앱에서 바로 열 수 있는 공유 링크를 생성해요.
      const tossShareLink = await getTossShareLink(
        trimmedDeepLinkPath,
        trimmedOgImageUrl.length > 0 ? trimmedOgImageUrl : undefined,
      );

      setGeneratedShareLink(tossShareLink);
      setSuccess("공유 링크를 만들었어요.", tossShareLink);
    } catch (error) {
      setError("공유 링크 생성에 실패했어요.", getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleShareMessage = async () => {
    const message =
      generatedShareLink ||
      "앱인토스 성장 기능 예제를 확인해 보세요. intoss://growth";

    try {
      setIsLoading(true);
      setWorking(
        "네이티브 공유 시트를 열고 있어요.",
        "사용자가 설치된 앱 중 하나를 골라 메시지를 공유할 수 있어요.",
      );

      await share({ message });

      setSuccess(
        "공유 시트 호출이 완료됐어요.",
        "사용자가 실제로 전송했는지 여부는 플랫폼 정책에 따라 확인하지 않아요.",
      );
    } catch (error) {
      setError("메시지 공유에 실패했어요.", getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogAnalyticsClick = async () => {
    const logName = analyticsEventName.trim() || "growth_cta_click";
    const target = analyticsTarget.trim() || "unknown";

    try {
      setIsLoading(true);
      setWorking(
        "분석 이벤트를 기록하고 있어요.",
        "샌드박스나 QR 테스트 환경에서는 실제 콘솔 데이터로 수집되지 않을 수 있어요.",
      );

      // web-framework의 Analytics는 screen, impression, click 단위의 이벤트를 기록해요.
      // log_name은 콘솔에서 이벤트를 구분하는 핵심 이름이므로 목적이 드러나게 작성해요.
      await Analytics.click({
        log_name: logName,
        target,
        referrer,
      });

      setSuccess(
        "클릭 이벤트를 기록했어요.",
        `log_name=${logName}, target=${target}, referrer=${referrer}`,
      );
    } catch (error) {
      setError("분석 이벤트 기록에 실패했어요.", getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogAnalyticsScreen = async () => {
    try {
      setIsLoading(true);

      // 화면 진입 이벤트에는 referrer를 함께 남겨 유입 경로별 전환을 볼 수 있게 해요.
      await Analytics.screen({
        log_name: "growth_sample_screen_view",
        screen_name: selectedFeature,
        referrer,
      });

      setSuccess(
        "화면 진입 이벤트를 기록했어요.",
        `screen_name=${selectedFeature}, referrer=${referrer}`,
      );
    } catch (error) {
      setError("화면 이벤트 기록에 실패했어요.", getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="app">
      <header className="hero">
        <p className="eyebrow">Acquisition & Growth</p>
        <h1>유입 & 성장 기능 샘플</h1>
        <p className="hero-description">
          프로모션, 리뷰 요청, 스마트 발송 동의, 공유 리워드, 공유, 분석을
          한 화면에서 테스트해요.
        </p>
      </header>

      <section className={`status-panel ${status.type}`} aria-live="polite">
        <span>실행 상태</span>
        <strong>{status.title}</strong>
        <p>{status.description}</p>
      </section>

      <nav className="tab-list" aria-label="성장 기능 선택">
        {featureTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={selectedFeature === tab.key ? "active" : ""}
            onClick={() => setSelectedFeature(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {selectedFeature === "promotion" ? (
        <section className="section">
          <h2>프로모션 리워드 지급</h2>
          <p className="section-description">
            `grantPromotionReward`로 비게임 미니앱에서 토스 포인트 프로모션을
            지급해요.
          </p>
          <label className="input-field">
            <span>promotionCode</span>
            <input
              value={promotionCode}
              onChange={(event) => setPromotionCode(event.target.value)}
              placeholder="EVENT_2026"
            />
          </label>
          <label className="input-field">
            <span>amount</span>
            <input
              type="number"
              min={1}
              value={promotionAmount}
              onChange={(event) =>
                setPromotionAmount(Number(event.target.value))
              }
            />
          </label>
          <div className="button-group">
            <button
              type="button"
              onClick={handleGrantPromotionReward}
              disabled={isLoading}
            >
              리워드 지급하기
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setHasPromotionGranted(false)}
            >
              중복 방어 초기화
            </button>
          </div>
        </section>
      ) : null}

      {selectedFeature === "review" ? (
        <section className="section">
          <h2>리뷰 요청</h2>
          <p className="section-description">
            핵심 행동 완료, 목표 달성, 보상 획득 직후처럼 사용자가 만족할
            가능성이 높은 순간에 호출해요.
          </p>
          <button type="button" onClick={handleRequestReview} disabled={isLoading}>
            리뷰 요청하기
          </button>
        </section>
      ) : null}

      {selectedFeature === "smartMessage" ? (
        <section className="section">
          <h2>스마트 발송 알림 동의</h2>
          <p className="section-description">
            알림 동의가 필요한 기능성 메시지를 보내기 전에
            `requestNotificationAgreement`를 호출해요.
          </p>
          <label className="input-field">
            <span>templateCode</span>
            <input
              value={templateCode}
              onChange={(event) => setTemplateCode(event.target.value)}
              placeholder="RESTOCK_ALERT_TEMPLATE"
            />
          </label>
          <button
            type="button"
            onClick={handleRequestNotificationAgreement}
            disabled={isLoading}
          >
            알림 동의 요청하기
          </button>
        </section>
      ) : null}

      {selectedFeature === "contactsViral" ? (
        <section className="section">
          <h2>공유 리워드</h2>
          <p className="section-description">
            `contactsViral`로 친구 공유 플로우를 열고, 이벤트로 리워드 지급
            정보를 받아요.
          </p>
          <label className="input-field">
            <span>moduleId</span>
            <input
              value={contactsViralModuleId}
              onChange={(event) => setContactsViralModuleId(event.target.value)}
              placeholder="공유 리워드 UUID"
            />
          </label>
          <button type="button" onClick={handleContactsViral} disabled={isLoading}>
            친구에게 공유하고 리워드 받기
          </button>
        </section>
      ) : null}

      {selectedFeature === "share" ? (
        <section className="section">
          <h2>토스앱 링크 공유</h2>
          <p className="section-description">
            `getTossShareLink`로 딥링크를 공유 링크로 만들고 `share`로 네이티브
            공유 시트를 열어요.
          </p>
          <label className="input-field">
            <span>deepLink</span>
            <input
              value={deepLinkPath}
              onChange={(event) => setDeepLinkPath(event.target.value)}
              placeholder="intoss://growth/path"
            />
          </label>
          <label className="input-field">
            <span>ogImageUrl</span>
            <input
              value={ogImageUrl}
              onChange={(event) => setOgImageUrl(event.target.value)}
              placeholder="https://..."
            />
          </label>
          <div className="button-group">
            <button
              type="button"
              onClick={handleCreateShareLink}
              disabled={isLoading}
            >
              공유 링크 만들기
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleShareMessage}
              disabled={isLoading}
            >
              메시지 공유하기
            </button>
          </div>
          {generatedShareLink.length > 0 ? (
            <p className="result-text">{generatedShareLink}</p>
          ) : null}
        </section>
      ) : null}

      {selectedFeature === "analytics" ? (
        <section className="section">
          <h2>분석 이벤트</h2>
          <p className="section-description">
            유입 경로 referrer와 함께 화면 진입, 클릭 이벤트를 기록해요.
          </p>
          <div className="referrer-box">
            <span>현재 referrer</span>
            <strong>{referrer}</strong>
          </div>
          <label className="input-field">
            <span>log_name</span>
            <input
              value={analyticsEventName}
              onChange={(event) => setAnalyticsEventName(event.target.value)}
              placeholder="growth_cta_click"
            />
          </label>
          <label className="input-field">
            <span>target</span>
            <input
              value={analyticsTarget}
              onChange={(event) => setAnalyticsTarget(event.target.value)}
              placeholder="promotion_reward"
            />
          </label>
          <div className="button-group">
            <button
              type="button"
              onClick={handleLogAnalyticsScreen}
              disabled={isLoading}
            >
              화면 이벤트 기록
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleLogAnalyticsClick}
              disabled={isLoading}
            >
              클릭 이벤트 기록
            </button>
          </div>
        </section>
      ) : null}

      <section className="notice">
        <strong>서버 API 예제</strong>
        <p>
          스마트 발송 메시지 발송과 서버형 프로모션 지급은
          `src/serverGrowthExamples.ts`에 별도로 정리했어요. mTLS 인증서가
          필요한 서버 간 통신이라 브라우저에서 직접 호출하지 않아요.
        </p>
      </section>
    </main>
  );
}

export default App;
