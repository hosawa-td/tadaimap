import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../theme/tokens";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.lead}>
          「タダイマップ」（以下「本アプリ」）は、家族・同居人などの限られたグループ内で、在宅状況を共有するための個人利用アプリです。本ポリシーでは、本アプリが取り扱う情報の内容と取り扱い方針について説明します。
        </Text>

        <Section title="1. 収集する情報">
          {"本アプリは、次の情報を取り扱います。\n" +
            "・表示名（ご自身で入力した名前）\n" +
            "・在宅状況（在宅／施設内／外出中）とその更新日時\n" +
            "・在宅中の任意の詳細メモ（例：「トイレ中」など、入力した場合のみ）\n" +
            "・自宅の位置（緯度・経度）と判定範囲（登録した場合のみ）\n" +
            "・端末を識別するためのランダムなID（電話番号・メールアドレス等の個人情報は含みません）\n" +
            "・プッシュ通知を送るための通知トークン（通知を有効にした場合のみ）"}
        </Section>

        <Section title="2. 利用目的">
          {"収集した情報は、同じ家族グループに参加しているメンバー間で在宅状況を共有する目的にのみ利用します。広告配信や、本アプリの外部でのマーケティング目的での利用は行いません。"}
        </Section>

        <Section title="3. 位置情報の取り扱い">
          {"自宅の位置情報は、ご自身の端末が自宅の範囲内にいるかどうかを判定するためだけに利用します。\n" +
            "・実際の現在地や移動履歴は保存されません（判定のたびに取得し、保存はしません）。\n" +
            "・自宅の緯度・経度そのものは、他の家族メンバーには一切表示されません。共有されるのは「在宅」「施設内」「外出中」という3段階の状態のみです。"}
        </Section>

        <Section title="4. 情報の保存・管理">
          {"情報は、家族グループの管理者が用意したGoogleスプレッドシート（共有ドライブ上）に保存され、APIサーバー（Vercel上で動作）を経由してアプリと連携します。第三者への販売・提供は行いません。"}
        </Section>

        <Section title="5. 情報を見られる範囲">
          {"在宅状況や表示名は、同じ招待コードで参加した同じグループのメンバーのみが閲覧できます。名前を非公開に設定した場合、他のメンバーには「メンバー」という匿名表示になります。"}
        </Section>

        <Section title="6. 利用する外部サービス">
          {"通知の送信のために、ネイティブアプリではExpo Push Notification Serviceを、ブラウザ版ではWeb標準のWeb Push（VAPID）を利用します。位置情報の取得には、端末（Android/iOS）またはブラウザが提供する標準の位置情報機能を利用します。"}
        </Section>

        <Section title="7. データの削除">
          {"グループから退出すると、ご自身の情報はグループの一覧から削除されます。グループの管理者がグループを削除した場合、そのグループに関する全メンバーの情報が削除されます。"}
        </Section>

        <Section title="8. お問い合わせ">
          {"本アプリに関するご質問は、グループに招待した管理者（グループの作成者）までご連絡ください。"}
        </Section>

        <Section title="9. 本ポリシーの変更">
          {"本ポリシーの内容は、本アプリの機能追加・変更にあわせて更新される場合があります。"}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  lead: { ...typography.bodyMd, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 22 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.titleMd, color: colors.textPrimary, marginBottom: spacing.xs },
  sectionBody: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 22 },
});
